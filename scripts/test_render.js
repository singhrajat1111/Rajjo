const path = require('path');
const esbuild = require(path.resolve('frontend/node_modules/vite/node_modules/esbuild'));
const vm = require('vm');

async function testRuntime() {
  try {
    const result = await esbuild.build({
      entryPoints: ['frontend/src/App.jsx'],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      loader: { '.jsx': 'jsx', '.js': 'js', '.css': 'empty' },
      alias: {
        '@': path.resolve('frontend/src')
      },
      external: ['react', 'react-dom', 'framer-motion', 'lucide-react', 'zustand', 'react-markdown', 'remark-gfm']
    });

    const code = result.outputFiles[0].text;
    console.log('App compiled for Node. Testing require...');
    
    // Create simulated browser globals
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
      electronAPI: null,
      location: { reload: () => {} }
    };
    global.document = {
      documentElement: {
        setAttribute: () => {},
        getAttribute: () => 'dark'
      },
      getElementById: () => ({ appendChild: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.navigator = { clipboard: { writeText: async () => {} } };
    global.fetch = async () => ({ ok: false, json: async () => ({}) });

    const App = require('vm').runInThisContext(`(function(require, module, exports) { ${code} \nreturn module.exports;})`)(require, { exports: {} }, {});
    console.log('App exported successfully:', typeof App, Object.keys(App));

    // Try rendering App with ReactDOMServer
    const React = require(path.resolve('frontend/node_modules/react'));
    const ReactDOMServer = require(path.resolve('frontend/node_modules/react-dom/server'));
    const html = ReactDOMServer.renderToString(React.createElement(App.default || App));
    console.log('Rendered HTML length:', html.length);
    console.log('Sample rendered HTML:', html.slice(0, 300));
  } catch (err) {
    console.error('RUNTIME ERROR OCCURRED:');
    console.error(err);
  }
}

testRuntime();
