/* eslint-disable import/no-unresolved */
import {MenuItem} from '@blueprintjs/core';
import {Editor, SceneExporter, WorkSpace} from 'babylonjs-editor';
import path from 'path';
import React from 'react';
import {SumerianHostAdder} from './hostAdder';
import {
  AssetsNotFoundError,
  installDependencies,
  prepareWorkspace,
  RelativeAssetsDir,
  RelativeWorkspaceScriptsPath,
  WorkspaceNotPreparedError,
} from './workplace';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const configuration = require('../config/SceneRequirements.json');

/**
 * The configuration that the Sumerian 'add host' menu should be initialized with
 */
interface ISumerianAddHostMenuProps {
  /**
   * A reference to the BabylonJS Editor object
   * @see {@link Editor}
   */
  editor: Editor;

  /**
   * The absolute path to where the plugin package is found.
   */
  pluginPath: string;
}

export default class SumerianAddHostMenu extends React.Component<ISumerianAddHostMenuProps> {
  availableHosts: string[];

  public constructor(props) {
    super(props);
    this.availableHosts = SumerianHostAdder.getAvailableHosts();
  }

  private _handleAddClick = async (event) => {
    const {editor, pluginPath} = this.props;
    const currentScene = editor.scene;
    const selectedCharacter = event.target.textContent;
    const workSpaceDir = WorkSpace.DirPath ?? '';
    const addHostProgress = editor.addTaskFeedback(100, 'Adding Sumerian Host');

    if (currentScene) {
      // First - try to install dependencies in the scene
      // It is not a hard blocker if this does not succeed, as the main reason this fails is because
      // npm cannot be found - in which case the user has a manual workaround available to them to fix this
      try {
        editor.updateTaskFeedback(
          addHostProgress,
          0,
          'Installing dependencies in scene'
        );

        await installDependencies(
          workSpaceDir,
          configuration.runtimeDependencies
        );
      } catch (error) {
        editor.console.logError(
          'Dependencies were not successfully installed due to error: '
        );
        editor.console.logError(error.message);
        editor.console.logError(
          'You will need to manually run `npm install` on the required dependencies in the workspace'
        );
      }

      try {
        editor.updateTaskFeedback(
          addHostProgress,
          10,
          'Copying required files into scene'
        );

        await prepareWorkspace(pluginPath, workSpaceDir);

        editor.updateTaskFeedback(addHostProgress, 20, 'Validating assets');
        const assetsDir = path.join(workSpaceDir, RelativeAssetsDir);
        const hostAdder = new SumerianHostAdder(assetsDir, selectedCharacter);

        editor.updateTaskFeedback(addHostProgress, 25, 'Adding host to scene');
        const characterAsset = await hostAdder.addToScene(currentScene);

        editor.updateTaskFeedback(
          addHostProgress,
          50,
          'Attaching initialization script to host'
        );
        hostAdder.attachInitScriptToHost(
          characterAsset,
          RelativeWorkspaceScriptsPath
        );

        editor.updateTaskFeedback(addHostProgress, 75, 'Updating editor');

        // update script mapping; this gets done automatically when the user hits 'play'
        // as the scene auto-saves (exports) before it runs, but we want to update ASAP
        // so that the scene code-base (which has the script mapping copied into it) reflects the changes
        await SceneExporter.GenerateScripts(editor);

        editor.updateTaskFeedback(
          addHostProgress,
          100,
          'Successfully added Sumerian host'
        );
      } catch (error) {
        let errorMessage =
          'An error has occurred while adding a Sumerian Host:';
        let errorStatus = 'An error has occurred while adding a Sumerian Host';
        switch (error.constructor) {
          case AssetsNotFoundError:
            errorMessage =
              'An error has occurred while initializing a Sumerian Host; the assets could not be found. Were they downloaded correctly when this plugin was installed?';
            errorStatus =
              'An error has ocurred while initializing a Sumerian Host';
            break;
          case WorkspaceNotPreparedError:
            errorMessage =
              'An error has occurred while copying necessary files into your workspace.';
            errorStatus = 'An error has ocurred while preparing the workspace';
            break;
          default:
            break;
        }

        console.log(error);
        editor.console.logError(errorMessage);
        editor.console.logError(error.message);
        editor.updateTaskFeedback(addHostProgress, 0, errorStatus);
      } finally {
        editor.graph.refresh(); // update editor's scene graph to show the new host node
        editor.closeTaskFeedback(addHostProgress, 15000);
      }
    }
  };

  public render(): React.ReactNode {
    return (
      <MenuItem icon="new-object" text="Add host">
        {this.availableHosts.map((characterId) => (
          <MenuItem
            key={`add-${characterId}`}
            text={characterId}
            onClick={this._handleAddClick}
          />
        ))}
      </MenuItem>
    );
  }
}
