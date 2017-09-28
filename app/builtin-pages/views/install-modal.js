import yo from 'yo-yo'
import slugify from 'slugify'
import segmentedProgressBar from '../com/segmented-progress-bar'
import APIS from '../../lib/app-perms'

// globals
// =

var numPages = 3
var pages = [renderAppInfoPage, renderPermsPage, renderInstallLocationPage]
var currentPage = 0
var currentNameOpt = 'default'
var currentCustomName = ''
var currentAssignedPermissions = null
var targetAppInfo
var replacedAppInfo
var viewError

// main
// =

window.setup = async function setup (opts) {
  try {
    // setup
    targetAppInfo = await getTargetAppInfo(opts.url)

    // configure pages
    if (!targetAppInfo.requestedPermissions) {
      numPages = 2
      pages = [renderAppInfoPage, renderInstallLocationPage]
    }

    // set current name
    if (targetAppInfo.isInstalled && targetAppInfo.name !== targetAppInfo.info.installedNames[0]) {
      currentNameOpt = 'custom'
      currentCustomName = targetAppInfo.info.installedNames[0]
    } else if (!targetAppInfo.name) {
      currentNameOpt = 'custom'
    }

    // set current permissions
    if (targetAppInfo.isInstalled) {
      currentAssignedPermissions = targetAppInfo.assignedPermissions
    } else {
      // default to giving the app everything it requested
      currentAssignedPermissions = targetAppInfo.requestedPermissions
    }

    // load current app info
    if (targetAppInfo.name) {
      replacedAppInfo = await getCurrentApp()
    }
  } catch (e) {
    console.error(e)
    viewError = e
  }

  // render
  renderToPage()
}

// events
// =

function onClickCancel (e) {
  e.preventDefault()
  beaker.browser.closeModal()
}

async function onSubmit (e) {
  e.preventDefault()

  currentPage++
  if (currentPage < numPages) {
    return renderToPage()
  }

  try {
    beaker.browser.closeModal(null, {
      name: getCurrentName(),
      permissions: currentAssignedPermissions
    })
  } catch (e) {
    beaker.browser.closeModal({
      name: e.name,
      message: e.message || e.toString(),
      internalError: true
    })
  }
}

function onChangeInstallNameOpt (e) {
  currentNameOpt = e.target.value
  renderToPage()
  onChangeName()

  if (currentNameOpt === 'custom') {
    document.querySelector('.custom-input input').focus()
  }
}

function onChangeCustomName (e) {
  currentCustomName = slugify(e.target.value)
  renderToPage()
  onChangeName()
}

async function onChangeName () {
  replacedAppInfo = await getCurrentApp()
  renderToPage()
}

function onChangePerm (e, api, perm) {
  const cap = currentAssignedPermissions
  if (!cap[api]) cap[api] = []
  if (e.target.checked && !cap[api].includes(perm)) {
    cap[api].push(perm)
  } else if (!e.target.checked && cap[api].includes(perm)) {
    cap[api] = cap[api].filter(p => p !== perm)
  }
  renderToPage()
}

// rendering
// =

function renderToPage () {
  if (viewError) {
    return yo.update(document.querySelector('main'), yo`<main>
      <div class="modal">
        <div class="modal-inner">
          <div class="install-modal">
            <h1 class="title">Error</h1>
            <pre>${viewError.toString()}</pre>
          </div>
        </div>
      </div>
    </main>`)
  }

  const renderPage = pages[currentPage]
  yo.update(document.querySelector('main'), yo`<main>
    <div class="modal">
      <div class="modal-inner">
        <div class="install-modal">
          <h1 class="title">
            ${targetAppInfo.isInstalled ? 'Configure' : 'Install'}
            ${getCurrentName() ? `app://${getCurrentName()}` : 'this app'}
          </h1>

          ${renderPage()}

          <form onsubmit=${onSubmit}>
            <div class="form-actions">
              <button type="button" onclick=${onClickCancel} class="btn cancel" tabindex="4">Cancel</button>
              ${segmentedProgressBar(currentPage, numPages)}
              <button type="submit" class="btn primary" tabindex="5" disabled=${!isReadyToInstall()}>
                ${currentPage < numPages - 1 ? 'Next' : 'Finish'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </main>`)
}

function renderAppInfoPage () {
  return yo`
    <div>
      <table class="app-info">
        <tr><td>Title:</td><td>${targetAppInfo.title}</td></tr>
        <tr><td>Description:</td><td>${targetAppInfo.description}</td></tr>
        <tr><td>Author:</td><td>${targetAppInfo.author}</td></tr>
      </table>
    </div>
  `
}

function renderPermsPage () {
  return yo`
    <div>
      <p class="help-text">
        Are these permissions ok?
      </p>

      <div class="perms">
        <ul>
          ${Object.keys(targetAppInfo.requestedPermissions).map(renderAPIPerms)}
        </ul>
      </div>
    </div>
  `
}

function renderAPIPerms (api) {
  const apiInfo = APIS[api]
  if (!apiInfo) return ''
  const requestedPerms = targetAppInfo.requestedPermissions[api]
  const assignedPerms = currentAssignedPermissions[api]
  return yo`<li>
    <strong>${apiInfo.label}</strong>
    <ul>
      ${requestedPerms.map(perm => yo`
        <li>
          <label>
            <input
              type="checkbox"
              name="${api}:${perm}"
              checked=${!!(assignedPerms && assignedPerms.includes(perm))}
              onchange=${e => onChangePerm(e, api, perm)}
            />
            ${apiInfo.perms[perm]}
          </label>
        </li>
      `)}
    </ul>
  </li>`
}

function renderInstallLocationPage () {
  return yo`
    <div>
      <p class="help-text">
        Where would you like to install?
      </p>

      <div class="install-name">
        ${targetAppInfo.name ?
          yo`<label><input type="radio" name="install-name-opt" value="default" onchange=${onChangeInstallNameOpt} checked=${currentNameOpt === 'default'} /> Install at <code>app://${targetAppInfo.name}</code> <span class="muted">(default)</span></label>`
          : ''}
        <label><input type="radio" name="install-name-opt" value="custom" onchange=${onChangeInstallNameOpt} checked=${currentNameOpt === 'custom'} /> Install at custom location</label>
        ${currentNameOpt === 'custom' ?
          yo`<div class="custom-input">
            <span>app://</span>
            <input type="text" placeholder="news, my-pics-app, etc." onchange=${onChangeCustomName} value=${currentCustomName} />
          </div>`
          : ''}
      </div>

      ${replacedAppInfo ?
        yo`<p class="footnote">
          This will replace the current application at <code>app://${getCurrentName()}</code>
          ${replacedAppInfo.title
            ? yo`<span>called <span class="nobreak">"${replacedAppInfo.title}"</span></span>`
            : yo`<span>(${replacedAppInfo.url})</span>`}
        </p>`
      : ''}
    </div>
  `
}

// helpers
// =

function isReadyToInstall () {
  return !!getCurrentName()
}

function getCurrentName () {
  if (currentNameOpt === 'default') {
    return targetAppInfo.name
  }
  return currentCustomName
}

async function getTargetAppInfo (url) {
  const a = new DatArchive(url)

  // read manifest
  try {
    var manifest = JSON.parse(await a.readFile('/dat.json'))
  } catch (e) {
    manifest = {}
  }
  manifest.app = manifest.app || {}

  // read install state
  const info = await a.getInfo()
  const isInstalled = info.installedNames.length > 0
  const assignedPermissions = isInstalled
    ? await beaker.sitedata.getAppPermissions(`app://${info.installedNames[0]}`)
    : {}
  
  return {
    url,
    info,
    isInstalled,
    title: toString(manifest.title),
    description: toString(manifest.description),
    author: toAuthorName(manifest.author),
    name: toSlug(manifest.app.name),
    requestedPermissions: toPermsObject(manifest.app.permissions),
    assignedPermissions: assignedPermissions || {}
  }
}

async function getCurrentApp () {
  var binding = await beaker.apps.get(0, getCurrentName())
  if (!binding) return null
  if (binding.url === targetAppInfo.url) return null
  if (binding.url.startsWith('dat://')) {
    let a = new DatArchive(binding.url)
    return a.getInfo()
  }
  return {url: binding.url}
}

function toString (v) {
  return v && typeof v === 'string' ? v : false
}

function toSlug (v) {
  v = toString(v)
  return v ? slugify(v) : false
}

function toPermsObject (v) {
  if (!v) return false
  if (typeof v !== 'object' || Array.isArray(v)) {
    return false
  }
  for (var k in v) {
    v[k] = toArrayOfStrings(v[k])
    if (!v[k] || !v[k].length) delete v[k]
  }
  if (Object.keys(v).length === 0) {
    return false
  }
  return v
}

function toArrayOfStrings (v) {
  if (!v) return false
  v = Array.isArray(v) ? v : [v]
  return v.filter(item => typeof item === 'string')
}

function toAuthorName (v) {
  if (!v) return false
  if (v.name) return toString(v.name)
  return toString(v)
}