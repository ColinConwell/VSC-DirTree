import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { request } from './lib/publication.mjs';

// Use the same Entra credential chain as the pinned VSCE version; never print its token.
export async function azurePublisher(publisher, acquire, get = request) {
  try {
    const token = await acquire();
    const result = await get(
      `https://marketplace.visualstudio.com/_apis/gallery/publishers/${encodeURIComponent(publisher)}?api-version=7.2-preview.1`,
      {
        headers: { Authorization: 'Basic ' + Buffer.from('OAuth:' + token).toString('base64') },
      },
    );
    return {
      status: result.status,
      data: result.data
        ? {
            publisherName: result.data.publisherName,
            displayName: result.data.displayName,
            publisherId: result.data.publisherId,
          }
        : undefined,
    };
  } catch {
    return { status: 0 };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.VSCE_AUTH !== 'azure' || !process.argv[2]) {
    console.error('This helper requires VSCE_AUTH=azure and a publisher name.');
    process.exitCode = 1;
  } else {
    const { getAzureCredentialAccessToken } = await import('@vscode/vsce/out/auth.js');
    console.log(
      JSON.stringify(await azurePublisher(process.argv[2], getAzureCredentialAccessToken)),
    );
  }
}
