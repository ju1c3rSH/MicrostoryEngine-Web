/* app_config.js - 应用元信息（版本/版权） */
(function(w){
  var k = 0x5A;
  var d = [25,40,63,62,51,46,96,178,208,195,178,208,237,188,235,218,191,223,234];
  var a = new Uint8Array(d.length);
  for (var i = 0; i < d.length; i++) a[i] = d[i] ^ k;
  var s = "";
  try { s = new TextDecoder().decode(a); } catch(e) {
    var t = "";
    for (var j=0;j<a.length;j++) t += String.fromCharCode(a[j]);
    try { s = decodeURIComponent(escape(t)); } catch(e2){ s=t; }
  }
  w.__APP_CFG = s;
  // 兼容旧接口
  w.__CREDIT = s;
  var target = w.AboutScreen || (typeof AboutScreen !== 'undefined' ? AboutScreen : null);
  if (target) {
    if (typeof target.inject === 'function') try{ target.inject(s);}catch(e){}
    else if (typeof target.setMeta === 'function') try{ target.setMeta(s);}catch(e){}
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
