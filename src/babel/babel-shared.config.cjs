const readFileSync = require('node:fs').readFileSync
const join = require('node:path').join

const findRoot = require('find-root')
const semver = require('semver')

const npmRoot = findRoot(process.cwd())
const pkgJSON = JSON.parse(readFileSync(join(npmRoot, 'package.json'), { encoding : 'utf8' }))

const NODE_ENV = process.env.NODE_ENV

const presetEnvOptions = {}
if (NODE_ENV !== 'test' || pkgJSON.type === 'module') {
  // for prod, rollup handles imports so it can do tree shaking and such; this disables Babel transforms
  presetEnvOptions.modules = false
  // for explicit es module targets, we need to set the targets to esmodules as well
  if (pkgJSON.type === 'module') {
    presetEnvOptions.targets = { esmodules : true }
  }
}
else { // it's a test environment and we are not explicitly targeting es modules
  Object.assign(presetEnvOptions, { modules : 'commonjs' })
}

const engineSpec = pkgJSON.engines || {}
const engineTargets = {}
for (const engine of Object.keys(engineSpec)) {
  const targetVer = semver.minVersion(engineSpec[engine]).raw
  engineTargets[engine] = targetVer
}
if (Object.keys(engineTargets).length > 0) {
  Object.assign(presetEnvOptions, { targets : engineTargets })
}

const pkgOverrides = (pkgJSON._sdlc && pkgJSON._sdlc.babel && pkgJSON._sdlc.babel['preset-env']) || {}
Object.assign(presetEnvOptions, pkgOverrides)

const babelPresets = [
  // in testing, we output each file, so we need to convert 'imports', in production, we let rollup handle the imports
  ['@babel/preset-env', presetEnvOptions],
  '@babel/preset-react'
]

const babelPlugins = [
  '@babel/plugin-proposal-throw-expressions',
  ['@babel/plugin-transform-runtime', // helps save on codesize by re-using injected helper code
    { corejs : false, helpers : true, regenerator : true } // re corejs, see polyfill plugin below
  ],
  '@babel/plugin-syntax-import-assertions',
  'inline-json-import'
]

module.exports.babelPresets = babelPresets
module.exports.babelPlugins = babelPlugins
