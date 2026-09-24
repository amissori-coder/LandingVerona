/* ============================================================
   PROVE - un finto YouTube (API IFrame) per Playwright
   ------------------------------------------------------------
   La rete in cui girano le prove non raggiunge www.youtube.com.
   Playwright intercetta https://www.youtube.com/iframe_api e
   risponde con questo file: definisce window.YT con un Player che
   si comporta come quello vero per quello che usa la pagina
   (pronto, stati, muto, volume, cambio video, errori, livelli di
   qualita'), e al posto del video mostra un riquadro colorato con
   l'identificativo e un orologio, cosi' negli screenshot si vede
   quale video sta "andando".

   Identificativi speciali: uno che comincia con "errore" fa
   scattare l'errore 150 (video non incorporabile), come succede
   con un link sbagliato o una diretta non ancora pubblica.

   Tutto quello che succede finisce in window.__fintoYT, che le
   prove leggono per controllare i comandi arrivati al player.
   ============================================================ */
(function () {
    'use strict';
    var STATI = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
    var registro = window.__fintoYT = window.__fintoYT || { giocatori: [], comandi: [], ultimo: null };

    function pagina(id) {
        return '<!doctype html><html><head><style>'
            + 'html,body{margin:0;height:100%;overflow:hidden;font-family:Arial,sans-serif;color:#fff;}'
            + 'body{display:flex;align-items:center;justify-content:center;flex-direction:column;'
            + 'background:linear-gradient(120deg,#0A2844,#1F5688,#2A5A85,#0A2844);background-size:400% 400%;'
            + 'animation:m 8s ease infinite;}'
            + '@keyframes m{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}'
            + 'b{font-size:5vw;letter-spacing:.08em}small{opacity:.8;font-size:2.2vw;margin-top:1vw}'
            + '#t{font-size:3.2vw;margin-top:1.5vw;font-variant-numeric:tabular-nums}'
            + '</style></head><body><b>VIDEO DI PROVA</b><small>id: ' + String(id).replace(/[<>&"]/g, '')
            + ' &middot; YouTube simulato (la rete di prova non raggiunge YouTube)</small><div id="t"></div>'
            + '<script>var s=Date.now();setInterval(function(){var x=Math.floor((Date.now()-s)/1000);'
            + 'document.getElementById("t").textContent=String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0");},500);<\/script>'
            + '</body></html>';
    }

    function Player(elemento, opzioni) {
        var ospite = typeof elemento === 'string' ? document.getElementById(elemento) : elemento;
        opzioni = opzioni || {};
        var pv = opzioni.playerVars || {};
        var self = this;
        this._opzioni = opzioni;
        this._eventi = opzioni.events || {};
        this._stato = STATI.UNSTARTED;
        this._muto = String(pv.mute) === '1';
        this._volume = 100;
        this._qualita = 'auto';
        this._inizio = Date.now();
        this._videoId = opzioni.videoId || '';
        var iframe = document.createElement('iframe');
        iframe.id = ospite.id;
        iframe.className = ospite.className;
        iframe.setAttribute('data-finto-youtube', '1');
        iframe.setAttribute('title', 'Video (simulato)');
        iframe.setAttribute('allow', 'autoplay; encrypted-media');
        iframe.style.border = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.srcdoc = pagina(this._videoId);
        ospite.parentNode.replaceChild(iframe, ospite);
        this._iframe = iframe;
        registro.giocatori.push(this);
        registro.ultimo = this;
        registro.opzioni = opzioni;
        setTimeout(function () {
            self._emetti('onReady', {});
            if (self._erroreSe(self._videoId)) return;
            if (String(pv.autoplay) === '1') self._cambia(STATI.PLAYING);
        }, 60);
    }
    Player.prototype._traccia = function (c, v) { registro.comandi.push({ comando: c, valore: v, quando: Date.now() }); };
    Player.prototype._emetti = function (nome, dati) {
        var f = this._eventi[nome];
        dati = dati || {};
        dati.target = this;
        if (typeof f === 'function') { try { f(dati); } catch (e) { setTimeout(function () { throw e; }); } }
    };
    Player.prototype._cambia = function (s) { this._stato = s; this._emetti('onStateChange', { data: s }); };
    Player.prototype._erroreSe = function (id) {
        if (/^errore/i.test(String(id || ''))) { var me = this; setTimeout(function () { me._emetti('onError', { data: 150 }); }, 30); return true; }
        return false;
    };
    Player.prototype.playVideo = function () { this._traccia('play'); this._cambia(STATI.PLAYING); };
    Player.prototype.pauseVideo = function () { this._traccia('pausa'); this._cambia(STATI.PAUSED); };
    Player.prototype.stopVideo = function () { this._traccia('stop'); this._cambia(STATI.ENDED); };
    Player.prototype.mute = function () { this._traccia('muto'); this._muto = true; };
    Player.prototype.unMute = function () { this._traccia('smuto'); this._muto = false; };
    Player.prototype.isMuted = function () { return this._muto; };
    Player.prototype.setVolume = function (v) { this._traccia('volume', v); this._volume = Math.max(0, Math.min(100, Number(v) || 0)); };
    Player.prototype.getVolume = function () { return this._volume; };
    Player.prototype.getPlayerState = function () { return this._stato; };
    Player.prototype.getDuration = function () { return Math.floor((Date.now() - this._inizio) / 1000) + 3600; };
    Player.prototype.getCurrentTime = function () { return this._tempo != null ? this._tempo : this.getDuration(); };
    Player.prototype.seekTo = function (s) { this._traccia('seek', s); this._tempo = s; };
    Player.prototype.getVideoData = function () { return { video_id: this._videoId, title: 'Video di prova', isLive: true }; };
    Player.prototype.getAvailableQualityLevels = function () { return ['hd1080', 'hd720', 'large', 'medium', 'auto']; };
    Player.prototype.getPlaybackQuality = function () { return this._qualita; };
    Player.prototype.setPlaybackQuality = function (q) { this._traccia('qualita', q); this._qualita = q; };
    Player.prototype.getIframe = function () { return this._iframe; };
    Player.prototype.loadVideoById = function (a) {
        var id = typeof a === 'object' && a ? a.videoId : a;
        this._traccia('carica', id);
        this._videoId = id;
        this._inizio = Date.now();
        this._tempo = null;
        this._iframe.srcdoc = pagina(id);
        if (this._erroreSe(id)) return;
        this._cambia(STATI.BUFFERING);
        var me = this;
        setTimeout(function () { me._cambia(STATI.PLAYING); }, 40);
    };
    Player.prototype.cueVideoById = function (a) {
        var id = typeof a === 'object' && a ? a.videoId : a;
        this._traccia('prepara', id);
        this._videoId = id;
        this._iframe.srcdoc = pagina(id);
        this._cambia(STATI.CUED);
    };
    Player.prototype.addEventListener = function (nome, f) { this._eventi[nome] = f; };
    Player.prototype.destroy = function () {
        this._traccia('distruggi');
        if (this._iframe && this._iframe.parentNode) this._iframe.parentNode.removeChild(this._iframe);
    };

    window.YT = { Player: Player, PlayerState: STATI, loaded: 1 };
    setTimeout(function () { if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady(); }, 0);
})();
