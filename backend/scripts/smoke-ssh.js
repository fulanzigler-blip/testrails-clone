// One-off smoke helper: run a command on a Mac runner via ssh2 from inside the
// backend container. Usage: node smoke-ssh.js <host> <user> "<command>"
const { Client } = require('ssh2');
const fs = require('fs');

const host = process.argv[2];
const username = process.argv[3];
const command = process.argv[4];
const keyPath = process.env.SSH_KEY || '/home/nodejs/.ssh/id_ed25519';

const client = new Client();
const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 60000);

client.on('ready', () => {
  client.exec(command, (err, stream) => {
    if (err) { console.error('EXEC_ERR', err.message); process.exit(1); }
    let out = '';
    stream.on('data', d => { out += d.toString(); });
    stream.stderr.on('data', d => { out += d.toString(); });
    stream.on('close', code => {
      clearTimeout(timer);
      console.log(out);
      console.log('EXIT:' + code);
      client.end();
      process.exit(0);
    });
  });
}).on('error', e => {
  console.error('CONN_ERR', e.message);
  process.exit(1);
}).connect({
  host,
  username,
  privateKey: fs.readFileSync(keyPath),
  readyTimeout: 15000,
});
