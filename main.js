const {app} = require('electron')
if (require('electron-squirrel-startup')) app.quit()

const path = require('path')
const autoUpdater = require('electron').autoUpdater
const BrowserWindow = require('electron').BrowserWindow
const {ipcMain} = require('electron')
const {Menu, Tray} = require('electron')

let tray = null

// squirrel

if (handleSquirrelEvent()) app.quit()

function handleSquirrelEvent () {
  if (process.argv.length === 1) {
    return false
  }

  const ChildProcess = require('child_process')

  const appFolder = path.resolve(process.execPath, '..')
  const rootAtomFolder = path.resolve(appFolder, '..')
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'))
  const exeName = path.basename(process.execPath)

  const spawn = (command, args) => {
    let spawnedProcess

    try {
      spawnedProcess = ChildProcess.spawn(command, args, {
        detached: true
      })
    } catch (err) {}
    return spawnedProcess
  }

  const spawnUpdate = (args) => {
    return spawn(updateDotExe, args)
  }

  const squirrelEvent = process.argv[1]
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      spawnUpdate(['--createShortcut', exeName])
      setTimeout(app.quit, 1000)
      return true
    case '--squirrel-uninstall':
      spawnUpdate(['--removeShortcut', exeName])
      setTimeout(app.quit, 1000)
      return true
    case '--squirrel-obsolete':
      app.quit()
      return true
  }
}

autoUpdater.addListener('error', (err) => { // eslint-disable-line
})

let version = app.getVersion()

autoUpdater.setFeedURL('http://deploy.realliferpg.de/update/win/' + version)
autoUpdater.checkForUpdates()

// real stuff that does something

let win
let downWin
let webWin
let loadWin

const createWindows = () => {
  // web process
  webWin = new BrowserWindow({
    icon: 'resources/icon/workericon.ico',
    width: 1000,
    height: 500,
    show: false,
    webPreferences: {
      webSecurity: false
    }
  }).on('close', () => {
    app.quit()
  })
  webWin.loadURL(`file://${__dirname}/app/web.html`)
  webWin.webContents.openDevTools({
    detach: false
  })

  // download process
  downWin = new BrowserWindow({
    icon: 'resources/icon/workericon.ico',
    width: 1000,
    height: 500,
    show: false,
    webPreferences: {
      webSecurity: false
    }
  }).on('close', () => {
    app.quit()
  })
  downWin.loadURL(`file://${__dirname}/app/dwn.html`)
  downWin.webContents.openDevTools({
    detach: false
  })

  // Create the browser window.
  win = new BrowserWindow({
    icon: 'resources/icon/appicon.ico',
    width: 1320,
    height: 730,
    minWidth: 1320,
    minHeight: 730,
    show: false,
    webPreferences: {
      webSecurity: false
    }
  }).on('close', () => {
    app.quit()
  })

  win.loadURL(`file://${__dirname}/index.html`)

  autoUpdater.addListener('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
    win.webContents.send('update-downloaded', {
      releaseNotes: releaseNotes,
      releaseName: releaseName,
      releaseDate: releaseDate,
      updateURL: updateURL
    })
  })

  autoUpdater.addListener('checking-for-update', () => {
    win.webContents.send('checking-for-update')
  })

  autoUpdater.addListener('update-not-available', () => {
    win.webContents.send('update-not-available')
  })

  autoUpdater.addListener('update-available', () => {
    win.webContents.send('update-available')
  })

  loadWin = new BrowserWindow({
    icon: 'resources/icon/appicon.ico',
    width: 200,
    height: 210,
    frame: false,
    webPreferences: {
      webSecurity: false
    }
  }).on('close', () => {
    app.quit()
  })

  loadWin.loadURL(`file://${__dirname}/app/loading.html`)

  setUpIpcHandlers()
  createTray()
}

const createTray = () => {
  tray = new Tray(app.getAppPath() + '\\resources\\icon\\tray.ico')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Auf Updates prüfen',
      click: () => {
        autoUpdater.checkForUpdates()
      }
    },
    {
      label: 'Dev-Tools',
      click: () => {
        toggleDevTools()
      }
    },
    {
      label: 'Restart',
      click: () => {
        app.relaunch()
        app.quit()
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Beenden',
      click: () => {
        app.quit()
      }
    }
  ])
  tray.setToolTip('RealLifeRPG Launcher')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    win.isMinimized() ? win.restore() : win.minimize()
  })
}

const toggleDevTools = () => {
  if (!win || !webWin || !downWin) return
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools()
    webWin.hide()
    downWin.hide()
  } else {
    win.webContents.openDevTools({detach: true})
    webWin.show()
    downWin.show()
  }
}

const setUpIpcHandlers = () => {
  if (!win || !webWin || !downWin) return
  ipcMain.on('to-dwn', (event, arg) => {
    downWin.webContents.send('to-dwn', arg)
  })

  ipcMain.on('to-web', (event, arg) => {
    webWin.webContents.send('to-web', arg)
  })

  ipcMain.on('to-app', (event, arg) => {
    win.webContents.send('to-app', arg)
  })
}

const shouldQuit = app.makeSingleInstance(() => {
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

if (shouldQuit) {
  app.quit()
}

app.on('ready', () => {
  createWindows()
})

app.on('activate', () => {
  if (win === null) {
    createWindows()
  }
})

app.on('before-quit', () => {
  ipcMain.removeAllListeners()
})

ipcMain.on('winprogress-change', (event, arg) => {
  win.setProgressBar(arg.progress)
})

ipcMain.on('app-loaded', () => {
  win.show()
  loadWin.destroy()
})

ipcMain.on('focus-window', () => {
  win.focus()
})

ipcMain.on('quitAndInstall', () => {
  autoUpdater.quitAndInstall()
  app.quit()
})
