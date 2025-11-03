import * as fs from 'node:fs'
import * as fsPath from 'node:path'

import findRoot from 'find-root'

// Let's rollup work with babel.
import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
// Add support for imported JSON files which otherwise cause silent, strange errors.
import json from '@rollup/plugin-json'
// Adds license information to the rolled up output file.
import license from 'rollup-plugin-license'
// Teaches rollup to treat `import * as fs from 'fs'` and similar as known externals. This license is conditionally
// included depending on the declared package type.
import nodeExternals from 'rollup-plugin-node-externals'
import reactExternals from 'rollup-plugin-peer-deps-external'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import url from '@rollup/plugin-url'

import { babelPlugins, babelPresets } from '../babel/babel-shared.config.cjs'

let packageJSONPath = process.env.JS_PACKAGE_PATH || findRoot(process.cwd())
if (packageJSONPath.endsWith('package.json') === false) {
  packageJSONPath = fsPath.resolve(packageJSONPath, 'package.json')
}
if (fs.existsSync(packageJSONPath) === false) {
  throw new Error(`Did not find required package file on path: ${packageJSONPath}. Do you need to set or correct 'JS_PACKAGE_PATH'?`)
}
const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath))

const nodeModulesDir = fsPath.dirname(packageJSONPath)

const jsInput = process.env.JS_BUILD_TARGET || 'src/index.js' // default
const sourcemap = true
let format = process.env.JS_FORMAT || null // TBD via packageJSON

const determineOutput = function() {
  const output = []

  const file = process.env.JS_OUT
  if (format === null) {
    format = packageJSON.type === 'module' ? 'es' : 'cjs' // CJS is the default
  }
  // es2015 is the default
  const generatedCode = packageJSON._sdlc && packageJSON._sdlc.rollup && packageJSON._sdlc.rollup['es5-compat']
    ? 'es5'
    : 'es2015'

  if (file !== undefined) {
    output.push({ file, format, generatedCode, sourcemap })
  }
  else { // can generate both commonjs and es5 module if 'module' present
    if (packageJSON.main !== undefined) {
      output.push({
        file : packageJSON.main,
        format,
        // generatedCode,
        sourcemap
      })
    }
    if (packageJSON.module !== undefined) {
      output.push({
        file   : packageJSON.module,
        format : 'es',
        // generatedCode,
        sourcemap
      })
    }
  }

  return output
}

const output = determineOutput()

const includePaths = [nodeModulesDir + '/node_modules/**']
// say we have sub-project with a package, se we set JS_PACKAGE_PATH src/tool or whatever, but when rollup runs, the
// babel resources will be installed in the root node_modules.
if (nodeModulesDir !== fsPath.resolve(process.cwd())) {
  includePaths.push(process.cwd() + '/node_modules/**')
}

const commonjsConfig = {
  include : includePaths
}
const commonJSOverrides = packageJSON._sdlc && packageJSON._sdlc.rollup && packageJSON._sdlc.rollup.commonjsConfig
if (commonJSOverrides) {
  Object.assign(commonjsConfig, commonJSOverrides)
}

const rollupConfig = {
  input : jsInput,
  output,
  watch : {
    clearScreen : false
  },
  plugins : [
    nodeExternals(), // this will bundle devDepndencies and nothing else; also marks node builtins as external,
    json(),
    url(),
    // Use babel for transpiling.
    babel({
      exclude      : 'node_modules/**',
      babelHelpers : 'runtime',
      presets      : babelPresets,
      plugins      : babelPlugins
    }),
    resolve({ extensions : ['.js', '.jsx', '.cjs', '.mjs', '.json'], preferBuiltins : true }), // I mean, why not? Seriously... why
    // not prefer built-ins by default?
    commonjs(commonjsConfig), // TODO: Do we need this?,
    terser({
      format : {
        preamble   : process.env.JS_OUT_PREAMBLE,
        semicolons : false
      }
    })
  ],
  onwarn : function(warning) {
    // https://docs.google.com/document/d/1f4iB4H4JGZ5LbqY-IX_2FXD47aq7ZouJYhjsnzrlUVg/edit#heading=h.g37mglv4gne6
    if (warning.code === 'THIS_IS_UNDEFINED') return
    console.error(warning.message)
  }
}

const { peerDependencies = {}, dependencies = {} } = packageJSON

const usesReact = 'react' in peerDependencies || 'react' in dependencies
if (usesReact) {
  rollupConfig.plugins.splice(1, 0, reactExternals())
  rollupConfig.external = ['react', 'react-dom']
}

const headerConfig = packageJSON.catalyst?.fileHeader

let headerPath = null
if (headerConfig !== undefined) {
  const configPath = fsPath.join(...headerConfig.split('/'))

  if (fs.existsSync(configPath)) {
    headerPath = configPath
  }
}
else {
  const fileHeader = fsPath.join(process.cwd(), 'src', 'file-header.txt')
  const licensePath = fsPath.join(process.cwd(), 'LICENSE.txt')

  headerPath = fs.existsSync(fileHeader) ? fileHeader : (fs.existsSync(licensePath) ? licensePath : null)
}

if (headerPath !== null) {
  rollupConfig.plugins.splice(0, 0, license({
    banner : {
      commentStyle : 'ignored', // tells minifiers to leave it
      content      : {
        file : headerPath
      }
    }
  }))
}

export default rollupConfig
