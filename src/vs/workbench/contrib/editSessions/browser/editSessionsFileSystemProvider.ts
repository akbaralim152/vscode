/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadCapability, IStat, IWatchOptions } from 'vs/platform/files/common/files';
import { ChangeType, decodeEditSessionFileContent, EDIT_SESSIONS_SCHEME, IEditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/common/editSessions';

export class EditSessionsFileSystemProvider implements IFileSystemProviderWithFileReadCapability {

	static readonly SCHEMA = EDIT_SESSIONS_SCHEME;

	constructor(
		@IEditSessionsWorkbenchService private editSessionsWorkbenchService: IEditSessionsWorkbenchService,
	) { }

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly;

	async readFile(resource: URI): Promise<Uint8Array> {
		const match = /(?<ref>[^/]+)\/(?<folderName>[^/]+)\/(?<filePath>.*)/.exec(resource.path.substring(1));
		if (!match?.groups) {
			throw FileSystemProviderErrorCode.FileNotFound;
		}
		const { ref, folderName, filePath } = match.groups;
		const data = await this.editSessionsWorkbenchService.read(ref);
		if (!data) {
			throw FileSystemProviderErrorCode.FileNotFound;
		}
		const change = data?.editSession.folders.find((f) => f.name === folderName)?.workingChanges.find((change) => change.relativeFilePath === filePath);
		if (!change || change.type === ChangeType.Deletion) {
			throw FileSystemProviderErrorCode.FileNotFound;
		}
		return decodeEditSessionFileContent(data.editSession.version, change.contents).buffer;
	}

	async stat(resource: URI): Promise<IStat> {
		const content = await this.readFile(resource);
		const currentTime = Date.now();
		return {
			type: FileType.File,
			permissions: FilePermission.Readonly,
			mtime: currentTime,
			ctime: currentTime,
			size: content.byteLength
		};
	}

	//#region Unsupported file operations
	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	watch(resource: URI, opts: IWatchOptions): IDisposable { return Disposable.None; }

	async mkdir(resource: URI): Promise<void> { }
	async readdir(resource: URI): Promise<[string, FileType][]> { return []; }

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { }
	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> { }
	//#endregion
}
