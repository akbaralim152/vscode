/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Codicon } from 'vs/base/common/codicons';
import { randomPath } from 'vs/base/common/extpath';
import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { ctxIsMergeEditor } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

interface MergeEditorContents {
	languageId: string;
	base: string;
	input1: string;
	input2: string;
	result: string;
	initialResult?: string;
}

export class MergeEditorCopyContentsToJSON extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.copyContentsJson',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.copyState',
					'Copy Merge Editor State as JSON'
				),
				original: 'Copy Merge Editor State as JSON',
			},
			icon: Codicon.layoutCentered,
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		const clipboardService = accessor.get(IClipboardService);
		const notificationService = accessor.get(INotificationService);

		if (!(activeEditorPane instanceof MergeEditor)) {
			notificationService.info({
				name: localize('mergeEditor.name', 'Merge Editor'),
				message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
			});
			return;
		}
		const model = activeEditorPane.model;
		if (!model) {
			return;
		}
		const contents: MergeEditorContents = {
			languageId: model.result.getLanguageId(),
			base: model.base.getValue(),
			input1: model.input1.getValue(),
			input2: model.input2.getValue(),
			result: model.result.getValue(),
			initialResult: model.getInitialResultValue(),
		};
		const jsonStr = JSON.stringify(contents, undefined, 4);
		clipboardService.writeText(jsonStr);

		notificationService.info({
			name: localize('mergeEditor.name', 'Merge Editor'),
			message: localize('mergeEditor.successfullyCopiedMergeEditorContents', "Successfully copied merge editor state"),
		});
	}
}

export class MergeEditorOpenContentsFromJSON extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.openContentsJson',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.openState',
					'Open Merge Editor State from JSON'
				),
				original: 'Open Merge Editor State from JSON',
			},
			icon: Codicon.layoutCentered,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, args?: { data?: MergeEditorContents; resultState?: 'initial' | 'current' }): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const clipboardService = accessor.get(IClipboardService);
		const editorService = accessor.get(IEditorService);
		const languageService = accessor.get(ILanguageService);
		const env = accessor.get(INativeEnvironmentService);
		const fileService = accessor.get(IFileService);

		if (!args) {
			args = {};
		}

		let content: MergeEditorContents;
		if (!args.data) {
			const result = await quickInputService.input({
				prompt: localize('mergeEditor.enterJSON', 'Enter JSON'),
				value: await clipboardService.readText(),
			});
			if (result === undefined) {
				return;
			}
			content =
				result !== ''
					? JSON.parse(result)
					: { base: '', input1: '', input2: '', result: '', languageId: 'plaintext' };
		} else {
			content = args.data;
		}

		const targetDir = URI.joinPath(env.tmpDir, randomPath());

		const extension = languageService.getExtensions(content.languageId)[0] || '';

		const baseUri = URI.joinPath(targetDir, `/base${extension}`);
		const input1Uri = URI.joinPath(targetDir, `/input1${extension}`);
		const input2Uri = URI.joinPath(targetDir, `/input2${extension}`);
		const resultUri = URI.joinPath(targetDir, `/result${extension}`);
		const initialResultUri = URI.joinPath(targetDir, `/initialResult${extension}`);

		async function writeFile(uri: URI, content: string): Promise<void> {
			await fileService.writeFile(uri, VSBuffer.fromString(content));
		}

		const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);

		await Promise.all([
			writeFile(baseUri, content.base),
			writeFile(input1Uri, content.input1),
			writeFile(input2Uri, content.input2),
			writeFile(resultUri, shouldOpenInitial ? (content.initialResult || '') : content.result),
			writeFile(initialResultUri, content.initialResult || ''),
		]);

		const input: IResourceMergeEditorInput = {
			base: { resource: baseUri },
			input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from JSON)' },
			input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from JSON)' },
			result: { resource: resultUri },
		};
		editorService.openEditor(input);
	}
}

export class MergeEditorSaveContentsToFolder extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.saveContentsToFolder',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.saveContentsToFolder',
					'Save Merge Editor State to Folder'
				),
				original: 'Save Merge Editor State to Folder',
			},
			icon: Codicon.layoutCentered,
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	async run(accessor: ServicesAccessor) {
		const { activeEditorPane } = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const dialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const languageService = accessor.get(ILanguageService);

		if (!(activeEditorPane instanceof MergeEditor)) {
			notificationService.info({
				name: localize('mergeEditor.name', 'Merge Editor'),
				message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
			});
			return;
		}
		const model = activeEditorPane.model;
		if (!model) {
			return;
		}

		const result = await dialogService.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
		});
		if (!result) {
			return;
		}
		const targetDir = result[0];

		const extension = languageService.getExtensions(model.result.getLanguageId())[0] || '';

		async function write(fileName: string, source: string) {
			await fileService.writeFile(URI.joinPath(targetDir, fileName + extension), VSBuffer.fromString(source), {});
		}

		await Promise.all([
			write('base', model.base.getValue()),
			write('input1', model.input1.getValue()),
			write('input2', model.input2.getValue()),
			write('result', model.result.getValue()),
			write('initialResult', model.getInitialResultValue()),
		]);

		notificationService.info({
			name: localize('mergeEditor.name', 'Merge Editor'),
			message: localize('mergeEditor.successfullySavedMergeEditorContentsToFolder', "Successfully saved merge editor state to folder"),
		});
	}
}

export class MergeEditorLoadContentsFromFolder extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.loadContentsFromFolder',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.loadContentsFromFolder',
					'Load Merge Editor State from Folder'
				),
				original: 'Load Merge Editor State from Folder',
			},
			icon: Codicon.layoutCentered,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, args?: { folderUri?: URI; resultState?: 'initial' | 'current' }) {
		const dialogService = accessor.get(IFileDialogService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const quickInputService = accessor.get(IQuickInputService);

		if (!args) {
			args = {};
		}

		let targetDir: URI;
		if (!args.folderUri) {
			const result = await dialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
			});
			if (!result) {
				return;
			}
			targetDir = result[0];
		} else {
			targetDir = args.folderUri;
		}

		const targetDirInfo = await fileService.resolve(targetDir);

		function findFile(name: string) {
			return targetDirInfo.children!.find(c => c.name.startsWith(name))?.resource!;
		}

		const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);

		const baseUri = findFile('base');
		const input1Uri = findFile('input1');
		const input2Uri = findFile('input2');
		const resultUri = findFile(shouldOpenInitial ? 'initialResult' : 'result');

		const input: IResourceMergeEditorInput = {
			base: { resource: baseUri },
			input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from file)' },
			input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from file)' },
			result: { resource: resultUri },
		};
		editorService.openEditor(input);
	}
}

async function promptOpenInitial(quickInputService: IQuickInputService, resultStateOverride?: 'initial' | 'current') {
	if (resultStateOverride) {
		return resultStateOverride === 'initial';
	}
	const result = await quickInputService.pick([{ label: 'result', result: false }, { label: 'initial result', result: true }], { canPickMany: false });
	return result?.result;
}
