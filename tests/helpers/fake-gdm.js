'use strict';
/* getDisplayMedia FALSO para testes: canvas animado → captureStream.
   Grava opções em window.__gdmOpts; opts.audio true → adiciona faixa de áudio. */
function FAKE_GDM() {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const cx = cv.getContext('2d');
  let h = 0;
  (function paint() { h = (h + 7) % 360; cx.fillStyle = 'hsl(' + h + ',60%,40%)'; cx.fillRect(0, 0, 640, 360); requestAnimationFrame(paint); })();
  const base = cv.captureStream(30);
  navigator.mediaDevices.getDisplayMedia = async (opts) => {
    window.__gdmOpts = JSON.parse(JSON.stringify(opts || {}));
    const s = new MediaStream([base.getVideoTracks()[0].clone()]);
    if (opts && opts.audio) {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest); osc.start();
      s.addTrack(dest.stream.getAudioTracks()[0]);
    }
    return s;
  };
}
module.exports = { FAKE_GDM };
