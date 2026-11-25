/* ============================================================
   IL SERVIZIO VERO, PER LA PROVA NEL BROWSER (prova-area.cjs)
   ------------------------------------------------------------
   Mette le porte vere del servizio email (email-service/api/*.js)
   su una porta locale, con firebase-admin collegato agli emulatori
   di Firebase invece che al database vero. La posta e' finta: le
   email non partono, restano nell'elenco `posta`.
   ============================================================ */
'use strict';
const http = require('http'), path = require('path'), crypto = require('crypto'), Module = require('module');
const REPO = path.join(__dirname, '../..');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8189';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-regole';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'demo-regole', private_key: privateKey, client_email: 'prova@demo-regole.iam.gserviceaccount.com' });
Object.assign(process.env, { SMTP_HOST: 'smtp.finto', SMTP_USER: 'area@revilaw.finto', SMTP_PASS: 'x', SMTP_FROM_NAME: 'Revilaw S.p.A.', APP_BASE_URL: 'http://127.0.0.1:8765' });

const posta = [];
const nodemailerFinto = { createTransport: () => ({ sendMail: async m => { posta.push(m); return { response: '250 ok', accepted: [].concat(m.to || [], m.bcc || []), rejected: [] }; }, verify: async () => true, close() { } }) };
const caricaVero = Module._load;
Module._load = function (nome, ...resto) { return nome === 'nodemailer' ? nodemailerFinto : caricaVero.call(this, nome, ...resto); };
// i moduli del servizio trovano firebase-admin qui
const risolviVero = Module._resolveFilename;
Module._resolveFilename = function (nome, genitore, ...resto) {
    try { return risolviVero.call(this, nome, genitore, ...resto); }
    catch (e) { return risolviVero.call(this, nome, Object.assign({}, genitore, { paths: [path.join(__dirname, 'node_modules')] }), ...resto); }
};
const admin = require('firebase-admin');
// su Vercel ogni porta e' un processo a se': qui stanno tutte insieme, e l'app si inizializza una volta sola
const initVera = admin.initializeApp.bind(admin);
admin.initializeApp = (...a) => (admin.apps.length ? admin.app() : initVera(...a));

function avvia(porta) {
    const server = http.createServer(async (req, res) => {
        const nome = (req.url.split('?')[0].match(/^\/api\/([a-z-]+)$/) || [])[1];
        res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (!nome) { res.statusCode = 404; res.end('{}'); return; }
        let corpo = '';
        req.on('data', c => { corpo += c; });
        req.on('end', async () => {
            try { req.body = corpo ? JSON.parse(corpo) : {}; } catch (_) { req.body = {}; }
            req.query = {};
            res.status = s => { res.statusCode = s; return res; };
            res.json = j => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); return res; };
            try { await require(path.join(REPO, 'email-service/api', nome + '.js'))(req, res); }
            catch (e) { console.error('servizio', nome, e); if (!res.writableEnded) { res.statusCode = 500; res.end('{"ok":false}'); } }
        });
    });
    return new Promise(ok => server.listen(porta, '127.0.0.1', () => ok(server)));
}
module.exports = { avvia, posta, admin };
