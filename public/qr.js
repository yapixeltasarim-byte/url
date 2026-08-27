(function () {
  'use strict';

  var canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var baseImg = new Image();
  var logoImg = null;

  function render() {
    canvas.width = baseImg.naturalWidth || 480;
    canvas.height = baseImg.naturalHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImg, 0, 0);

    if (logoImg) {
      // Logo genelde kendi zemini (beyaz disk vb.) ile geliyor - ustune
      // ayrica beyaz kutu/yuvarlak eklemiyoruz, dogrudan ortaya basiyoruz.
      var size = canvas.width * 0.24;
      var x = (canvas.width - size) / 2;
      var y = (canvas.height - size) / 2;
      ctx.drawImage(logoImg, x, y, size, size);
    }
  }

  baseImg.onload = render;
  baseImg.src = canvas.dataset.src;

  if (canvas.dataset.defaultLogo) {
    var defaultLogo = new Image();
    defaultLogo.onload = function () { logoImg = defaultLogo; render(); };
    defaultLogo.src = canvas.dataset.defaultLogo;
  }

  var downloadBtn = document.getElementById('qrDownload');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      var a = document.createElement('a');
      a.download = 'qr-' + (canvas.dataset.code || 'kod') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  }
})();
