import { inject } from 'inversify';
import { IpcMessageEvent } from 'electron';

import LocalLibrary from '../services/local-library';
import { ipcController, ipcEvent } from '../utils/decorators';
import LocalLibraryDb from '../services/local-library/db';
import Platform from '../services/platform';
import Window from '../services/window';

@ipcController()
class LocalIpcCtrl {
  constructor(
    @inject(LocalLibrary) private localLibrary: LocalLibrary,
    @inject(LocalLibraryDb) private localLibraryDb: LocalLibraryDb,
    @inject(Platform) private platform: Platform,
    @inject(Window) private window: Window
  ) {}

  private normalizeFolderPath(folder: string) {
    if (this.platform.isWindows()) {
      folder = folder.replace(/\\/g, '/');
    }

    return folder;
  }

  /**
   * get local files metas
   */
  @ipcEvent('get-metas')
  async getLocalMetas(event: IpcMessageEvent) {
    const tracks = await this.localLibraryDb.getTracks();
    event.returnValue = tracks;
  }

  /**
   * get local libray folder from store
   */
  @ipcEvent('get-localfolders')
  async getLocalFolders(event: IpcMessageEvent) {
    const folders = await this.localLibraryDb.getLocalFolders();
    event.returnValue = folders.map(({ path }) => path);
  }

  /**
   * store local library folders
   */
  @ipcEvent('set-localfolders')
  async setLocalFolders(event: IpcMessageEvent, directories: string[]) {
    const localFolders = await Promise.all(
      directories
        .map(folder => this.localLibraryDb.addFolder(this.normalizeFolderPath(folder)))
    );

    const cache = await this.localLibrary.scanFoldersAndGetMeta(localFolders, (scanProgress, scanTotal) => {
      this.window.send('local-files-progress', {scanProgress, scanTotal});
    });

    // console.log(cache);

    this.window.send('local-files', Object.values(cache).reduce((acc, track) => ({
      ...acc,
      [track.uuid as string]: track
    }), {}));
  }

  /**
   * Remove a local folder and all metadata attached to it 
   */
  @ipcEvent('remove-localfolder')
  async removeLocalFolder(event: IpcMessageEvent, folder: string) {
    const metas = await this.localLibraryDb.removeLocalFolder(
      this.normalizeFolderPath(folder)
    );

    this.window.send('local-files', metas);
  }

  /**
   * scan local library for audio files, format and store all the metadata
   */
  @ipcEvent('refresh-localfolders')
  async onRefreshLocalFolders() {
    try {
      const folders = await this.localLibraryDb.getLocalFolders();
      const cache = await this.localLibrary.scanFoldersAndGetMeta(
        folders,
        (scanProgress, scanTotal) => {
          this.window.send('local-files-progress', {scanProgress, scanTotal});
        }
      );

      this.window.send('local-files', cache);
    } catch (err) {
      this.window.send('local-files-error', err);
    }
  }

  @ipcEvent('queue-drop')
  async addTracks(event: IpcMessageEvent, filesPath: string[]) {
    const metas = await this.localLibrary.getMetas(filesPath);

    this.window.send('queue-add', metas);
  }
}

export default LocalIpcCtrl;
