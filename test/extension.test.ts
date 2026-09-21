import * as vscode from 'vscode';
export async function run() {
  const extension = vscode.extensions.getExtension('ColinConwell.vsc-dirtree');
  if (!extension) throw new Error('DirTree is not installed in the test host.');
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['dirtree.open', 'dirtree.copy', 'dirtree.copyMarkdown']) {
    if (!commands.includes(command)) throw new Error(`Missing command: ${command}`);
  }
  await vscode.commands.executeCommand('dirtree.copy');
  const plain = await vscode.env.clipboard.readText();
  if (plain !== 'project/\n├── src/\n│   └── index.ts\n└── README.md')
    throw new Error('Plain text clipboard mismatch.');
  await vscode.commands.executeCommand('dirtree.copyMarkdown');
  if ((await vscode.env.clipboard.readText()) !== '```text\n' + plain + '\n```\n')
    throw new Error('Markdown clipboard mismatch.');
  await vscode.commands.executeCommand('dirtree.open');
  console.log('DirTree: activation, commands, clipboard, and sidebar-open integration passed.');
}
