// A fast UI harness. Product code still runs exclusively inside a VS Code webview.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4317);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DirTree UI Harness</title><link rel="stylesheet" href="/webview.css"></head><body><div id="root"></div><script src="/bridge.js"></script><script src="/webview.js"></script></body></html>`;
const bridge = `window.acquireVsCodeApi = () => ({
  getState: () => JSON.parse(sessionStorage.getItem('view') || 'null'),
  setState: state => sessionStorage.setItem('view', JSON.stringify(state)),
  postMessage: async data => {
    const send = value => window.postMessage(value, '*');
    if (data.type === 'ready') {
      const tree = JSON.parse(localStorage.getItem('tree') || 'null');
      if (tree) send({type:'init', tree});
      else send({type:'init', tree:{id:'root',name:'project',kind:'folder',children:[{id:'src',name:'src',kind:'folder',children:[{id:'entry',name:'index.ts',kind:'file',children:[]}]},{id:'readme',name:'README.md',kind:'file',children:[]}]}});
    }
    if (data.type === 'save') { localStorage.setItem('tree',JSON.stringify(data.tree)); send({type:'saved'}); }
    if (data.type === 'copy') {
      window.__lastCopy = data;
      send({type:'copied',requestId:data.requestId});
    }
  }
});`;
createServer(async (req, res) => {
  try {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(html);
    }
    if (req.url === '/bridge.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(bridge);
    }
    if (req.url === '/webview.js' || req.url === '/webview.css') {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      return res.end(await readFile(new URL('../dist' + req.url, import.meta.url)));
    }
    res.writeHead(404);
    res.end();
  } catch {
    res.writeHead(500);
    res.end('Build the extension first.');
  }
}).listen(port, '127.0.0.1', () => console.log(`DirTree UI harness: http://127.0.0.1:${port}`));
