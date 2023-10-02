import * as fs from 'node:fs'
import * as fsPath from 'node:path'

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
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import url from '@rollup/plugin-url'

import { babelPlugins, babelPresets } from '../babel/babel-shared.config.cjs'

const packageJSON = JSON.parse(fs.readFileSync(fsPath.join(process.cwd(), 'package.json')))

// const getTag = (tag) => packageJSON.catalyst && packageJSON.catalyst.tags && packageJSON.catalyst.tags[tag]
const hasTag = (tag) => !!(packageJSON.catalyst && packageJSON.catalyst.tags && tag in packageJSON.catalyst.tags)
const localConfig = packageJSON.catalyst && packageJSON.catalyst.rollupConfig

const jsInput = process.env.JS_BUILD_TARGET || 'src/index.js' // default
const sourcemap = true
let format = process.env.JS_FORMAT || null // TBD via packageJSON

const determineOutput = function() {
  const output = []

  const file = process.env.JS_OUT
  if (format === null) {
    format = packageJSON.type === 'module' ? 'es' : 'cjs'
  }
  const generatedCode = hasTag('es5-compat') ? 'es5' : 'es2015'

  if (file !== undefined) {
    output.push({ file, format, generatedCode, sourcemap })
  }
  else {
    if (packageJSON.main !== undefined) {
      output.push({
        file : packageJSON.main,
        format,
        generatedCode,
        sourcemap
      })
    }
    if (packageJSON.module !== undefined) {
      output.push({
        file   : packageJSON.module,
        format : 'es',
        generatedCode,
        sourcemap
      })
    }
  }

  return output
}

const output = determineOutput()

const commonjsConfig = {
  include : ['node_modules/**']
}
if (localConfig) {
  Object.assign(commonjsConfig, localConfig.commonjsConfig)
}

const rollupConfig = {
  input : jsInput,
  output,
  watch : {
    clearScreen : false
  },
  plugins : [
    nodeExternals(), // this will bundle devDepndencies and nothing else; also marks node builtins as external
    json(),
    url(),
    // Use babel for transpiling.
    babel({
      exclude      : 'node_modules/**',
      babelHelpers : 'runtime',
      presets      : babelPresets,
      plugins      : babelPlugins
    }),
    // The default extensions include the ones we really need, as well as others that are probably useful for
    // compatability.
    resolve({ /* extensions: [ '.js', '.jsx', 'json' ], */ preferBuiltins : true }), // I mean, why not? Seriously... why
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

const licensePath = fsPath.join(process.cwd(), 'LICENSE.txt')
if (fs.existsSync(licensePath)) {
  rollupConfig.plugins.splice(0, 0, license({
    banner : {
      commentStyle : 'ignored', // tells minifiers to leave it
      content      : {
        file : licensePath
      }
    }
  }))
}

export default rollupConfig
