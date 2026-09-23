/* Gopher payment-method store + UI (G40-38) — shared by the account "Payment methods" screen
   AND the checkout/review pay-picker. Front-end reference only (no Stripe); mirrors the canonical
   __payStore in Final/gopher-request.html + gopher-connect.html. Session-persisted so the two split
   pages (home + flow) stay in sync. G40-38 owner rulings 2026-09-06: PayPal and Venmo are
   excluded (not available through Stripe for a US account) and NO method carries a fee different
   from a card, so the fee tag is gone. A Cash App request can never be cost-adjusted upward (Cash
   App Pay has no incremental authorization) — the picker says so. Card entry supports a demo
   "Scan card" affordance.
   Handoff contract: docs/handoff/G40-38-payment-methods.md */
(function(){
  if(window.GopherPay) return;
  var LS='gopher_paystore_v1';

  // Wallets / alternative methods. No method carries a fee different from a card (owner, 2026-09-06).
  var WALLETS=[
    {brand:'applepay', name:'Apple Pay',  fee:false, device:'apple',   sub:'Linked to your device'},
    {brand:'googlepay',name:'Google Pay', fee:false, device:'android', sub:'Linked to your device'},
    {brand:'cashapp',  name:'Cash App',   fee:false, sub:'Cover the cost of items in full \u00b7 no upward adjustment'}
  ];
  var FEE_BRANDS={};
  var BRAND_NAME={visa:'Visa',mastercard:'Mastercard',amex:'American Express',discover:'Discover'};

  function seed(){ return [
    {key:'pm_visa', brand:'visa',       name:'Visa',       last4:'4242', exp:'09/27', sub:'Ending in 4242 · Exp 09/27', isDefault:true},
    {key:'pm_mc',   brand:'mastercard', name:'Mastercard', last4:'8210', exp:'04/26', sub:'Ending in 8210 · Exp 04/26', isDefault:false},
    {key:'pm_apay', brand:'applepay',   name:'Apple Pay',  sub:'Linked to your device', isDefault:false, wallet:true}
  ]; }

  var store, selectedKey, listeners=[];
  function load(){
    try{ var raw=sessionStorage.getItem(LS); if(raw){ var o=JSON.parse(raw); if(o&&o.m&&o.m.length){ store=o.m; selectedKey=o.s||o.m[0].key; return; } } }catch(e){}
    store=seed(); selectedKey='pm_visa'; save();
  }
  function save(){ try{ sessionStorage.setItem(LS, JSON.stringify({m:store,s:selectedKey})); }catch(e){} }
  load();
  function notify(){ save(); listeners.forEach(function(fn){ try{ fn(); }catch(e){} }); }
  function key(){ return 'pm_'+Math.random().toString(36).slice(2,8); }
  function clearDefault(){ store.forEach(function(m){ m.isDefault=false; }); }
  function feeFor(brand){ return !!FEE_BRANDS[brand]; }
  function isWallet(b){ return b==='applepay'||b==='googlepay'||b==='paypal'||b==='cashapp'||b==='venmo'; }

  // ── brand marks (compact, brand-coloured) ──
  var MARK_BG={visa:'#1a1f71',mastercard:'#1a1f2b',amex:'#006fcf',discover:'#e86100',applepay:'#000',googlepay:'#fff',paypal:'#003087',cashapp:'#00c244',venmo:'#3d95ce'};
  // Real marks for the wallet / alternative rows (owner 2026-09-08): the same
  // official artwork the app ships in public/assets/marks — Apple's Apple Pay
  // mark, Google's Google Pay mark, the Cash App Pay lockup, and the Link mark
  // Stripe ships. Card networks keep the compact text badge.
  //
  // FOUR FIELDS, and the last one is not optional (G40-11, 2026-09-09). Entries
  // are [file, fileAspect, alt, inkFillsHeight].
  //
  //   * Sized by the FILE, Google Pay draws 1.85x smaller than everything
  //     beside it: its file is a white pill with the artwork inset, and the ink
  //     fills only 0.54 of the file's height. Measured by rendering each file
  //     on white and scanning for the bounding box of every non-white pixel —
  //     not eyeballed. So the box is grown to inkHeight / fills.
  //   * The mark must match its GROUND. .gp-row and .gp-wbtn are background:#fff,
  //     and cash-app-pay.svg / link.svg are the REVERSED (white-ink) variants —
  //     correct on the app's old navy→green tile, invisible here. The
  //     -on-light files are the ones for a white row. Same pairing as the app's
  //     src / srcOnDark in src/services/paymentMethodShape.js.
  var MARK_IMG={applepay:['apple-pay.svg',1.56,'Apple Pay',1],googlepay:['google-pay.svg',1.47,'Google Pay',0.54],cashapp:['cash-app-pay-on-light.svg',5.63,'Cash App Pay',1],link:['link-on-light.svg',3,'Link',1]};
  function brandMark(b){
    var mi=MARK_IMG[b];
    if(mi){
      var ink=28, fills=mi[3]||1;
      var bh=Math.round(ink/fills), bw=Math.round(bh*mi[1]);
      // the grown box overhangs the row rather than making this one row taller
      var bleed=Math.round((bh-ink)/2);
      return '<img src="../../assets/marks/'+mi[0]+'" alt="'+mi[2]+'" height="'+bh+'" width="'+bw+'" style="display:block;flex:0 0 auto;margin:'+(-bleed)+'px 0;">';
    }
    var bg=MARK_BG[b]||'#5b6472', fg='#fff', txt=({visa:'VISA',mastercard:'MC',amex:'AMEX',discover:'DISC',applepay:' Pay',googlepay:'G Pay',paypal:'PayPal',cashapp:'Cash',venmo:'venmo'})[b]||String(b||'?').slice(0,4).toUpperCase();
    if(b==='googlepay') fg='#5f6368';
    return '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:28px;padding:0 7px;border-radius:6px;background:'+bg+';color:'+fg+';font-family:Nunito,sans-serif;font-weight:900;font-size:11px;letter-spacing:.3px;flex:0 0 auto;'+(b==='googlepay'?'border:1px solid #dadce0;':'')+'">'+txt+'</span>';
  }

  function detectBrand(num){ var n=String(num).replace(/\D/g,'');
    if(/^4/.test(n)) return 'visa';
    if(/^3[47]/.test(n)) return 'amex';
    if(/^(6011|65|64[4-9]|622)/.test(n)) return 'discover';
    if(/^5[1-5]/.test(n)) return 'mastercard';
    var p4=parseInt(n.slice(0,4),10); if(n.length>=4 && p4>=2221 && p4<=2720) return 'mastercard';
    return ''; }
  function fmtNum(num,brand){ var amex=brand==='amex'; var n=String(num).replace(/\D/g,'').slice(0,amex?15:16);
    var groups=amex?[4,6,5]:[4,4,4,4], out=[], i=0;
    for(var g=0;g<groups.length;g++){ if(i>=n.length)break; out.push(n.slice(i,i+groups[g])); i+=groups[g]; }
    if(i<n.length) out.push(n.slice(i)); return out.join(' '); }

  // ── styles (injected once) ──
  function injectCSS(root){
    var host=root||document; if(host.getElementById && host.getElementById('gp-css')) return;
    var s=document.createElement('style'); s.id='gp-css'; s.textContent=
     '.gp-ov{position:absolute;inset:0;z-index:10060;background:rgba(6,12,28,.5);display:flex;align-items:flex-end;justify-content:center;font-family:Nunito,sans-serif;}'
    +'.gp-sheet{background:#FBF7EF;width:100%;max-height:90%;overflow-y:auto;border-radius:22px 22px 0 0;padding:16px 16px 22px;box-shadow:0 -12px 40px rgba(0,0,0,.28);}'
    +'.gp-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}'
    +'.gp-h{font-family:Nunito,sans-serif;font-weight:900;font-size:18px;color:#002461;}'
    +'.gp-x{font-size:22px;color:#8a94a3;cursor:pointer;line-height:1;border:0;background:none;}'
    +'.gp-sub{font-family:"DM Sans",sans-serif;font-size:12px;color:#8a94a3;margin:0 0 12px;line-height:1.45;}'
    +'.gp-row{display:flex;align-items:center;gap:11px;padding:12px;border:1.5px solid #e8e2d4;border-radius:14px;background:#fff;margin-bottom:9px;cursor:pointer;transition:border-color .12s,box-shadow .12s;}'
    +'.gp-row.sel{border-color:#1CB061;box-shadow:0 0 0 3px rgba(28,176,97,.14);}'
    +'.gp-rtx{flex:1;min-width:0;}'
    +'.gp-nm{font-family:Nunito,sans-serif;font-weight:800;font-size:13.5px;color:#002461;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}'
    +'.gp-s{font-family:"DM Sans",sans-serif;font-size:11px;color:#8a94a3;margin-top:2px;}'
    +'.gp-badge{font-family:Nunito,sans-serif;font-weight:800;font-size:9.5px;padding:2px 7px;border-radius:99px;letter-spacing:.2px;}'
    +'.gp-badge.def{background:#e7f7ec;color:#0a7d44;}'
    +'.gp-badge.fee{background:#FFF4E5;color:#8a5a00;}'
    +'.gp-badge.dev{background:#eef1f5;color:#41506b;}'
    +'.gp-radio{width:20px;height:20px;border-radius:50%;border:2px solid #d3ccbb;flex:0 0 auto;position:relative;}'
    +'.gp-row.sel .gp-radio{border-color:#1CB061;}'
    +'.gp-row.sel .gp-radio:after{content:"";position:absolute;inset:3px;border-radius:50%;background:#1CB061;}'
    +'.gp-rm{border:0;background:none;color:#c44257;font-family:Nunito,sans-serif;font-weight:800;font-size:11.5px;cursor:pointer;padding:4px 6px;flex:0 0 auto;}'
    +'.gp-add{width:100%;margin-top:6px;padding:13px;border:1.5px dashed #b9c6dd;background:#f5f8ff;color:#002461;border-radius:13px;font-family:Nunito,sans-serif;font-weight:800;font-size:13.5px;cursor:pointer;}'
    +'.gp-cta{width:100%;margin-top:12px;padding:14px;border:0;border-radius:13px;background:#1CB061;color:#fff;font-family:Nunito,sans-serif;font-weight:900;font-size:14.5px;cursor:pointer;}'
    +'.gp-sec{font-family:Nunito,sans-serif;font-weight:900;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:#8C8675;margin:14px 0 8px;}'
    +'.gp-wbtn{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:1.5px solid #e8e2d4;border-radius:13px;background:#fff;margin-bottom:8px;cursor:pointer;font-family:Nunito,sans-serif;font-weight:800;font-size:13px;color:#002461;}'
    +'.gp-fld{margin-bottom:10px;}'
    +'.gp-lb{font-family:Nunito,sans-serif;font-weight:800;font-size:11.5px;color:#002461;display:block;margin-bottom:5px;}'
    +'.gp-in{width:100%;box-sizing:border-box;border:1.5px solid #e3ddcd;border-radius:11px;padding:12px 13px;font-family:"DM Sans",sans-serif;font-size:14px;color:#002461;outline:none;}'
    +'.gp-in:focus{border-color:#1CB061;}'
    +'.gp-prev{border-radius:15px;padding:15px 16px;color:#fff;margin-bottom:14px;box-shadow:0 8px 22px rgba(0,36,97,.22);}'
    +'.gp-prev .pn{font-family:"DM Sans",monospace;font-weight:600;font-size:17px;letter-spacing:2px;margin:16px 0 12px;}'
    +'.gp-scan{border:1.5px solid #002461;background:#fff;color:#002461;border-radius:11px;padding:10px 12px;font-family:Nunito,sans-serif;font-weight:800;font-size:12.5px;cursor:pointer;width:100%;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px;}';
    (host.head||host.body||host).appendChild(s);
  }
  function mount(){ return document.getElementById('phone')||document.body; }
  function overlay(){ injectCSS(); var ov=document.createElement('div'); ov.className='gp-ov'; ov.onclick=function(e){ if(e.target===ov) ov.remove(); }; mount().appendChild(ov); return ov; }

  // ── method row (shared by manager + picker) ──
  function methodRow(m, opts){ opts=opts||{};
    var fee = feeFor(m.brand);
    var badges='';
    if(opts.manage && m.isDefault) badges+='<span class="gp-badge def">Default</span>';
    if(m.device||m.brand==='applepay'||m.brand==='googlepay') badges+='<span class="gp-badge dev">Linked to device</span>';
    if(fee) badges+='<span class="gp-badge fee">Small fee</span>';
    var right = opts.pick
      ? '<span class="gp-radio"></span>'
      : (opts.manage && !m.isDefault ? '<button class="gp-rm" data-rm="'+m.key+'">Remove</button>' : (m.isDefault?'<span class="gp-badge def">Default</span>':''));
    var sel = (opts.pick && m.key===selectedKey) ? ' sel' : '';
    return '<div class="gp-row'+sel+'" data-key="'+m.key+'" data-act="'+(opts.pick?'pick':(opts.manage?'default':''))+'">'
      +brandMark(m.brand)
      +'<div class="gp-rtx"><div class="gp-nm">'+(m.name||'Card')+' '+badges+'</div><div class="gp-s">'+(m.sub||'')+'</div></div>'
      +right+'</div>';
  }

  // ── account "Payment methods" manager ──
  function openManager(){
    var ov=overlay();
    var sheet=document.createElement('div'); sheet.className='gp-sheet'; ov.appendChild(sheet);
    function draw(){
      sheet.innerHTML='<div class="gp-hd"><div class="gp-h">Payment methods</div><button class="gp-x">&times;</button></div>'
        +'<p class="gp-sub">Cards and wallets on your account. Set a default, remove, or add a new method — cards, digital wallets, or bank pay.</p>'
        +store.map(function(m){ return methodRow(m,{manage:true}); }).join('')
        +'<button class="gp-add" data-add>+ New payment method</button>';
      sheet.querySelector('.gp-x').onclick=function(){ ov.remove(); };
      sheet.querySelector('[data-add]').onclick=function(){ openAddModal(function(){ draw(); }); };
      sheet.querySelectorAll('.gp-row[data-act="default"]').forEach(function(r){ r.onclick=function(e){ if(e.target.closest('[data-rm]'))return; setDefault(r.getAttribute('data-key')); draw(); }; });
      sheet.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); remove(b.getAttribute('data-rm')); draw(); }; });
    }
    draw();
  }

  // ── checkout "Choose payment method" picker ──
  function openPicker(onPicked){
    var ov=overlay();
    var sheet=document.createElement('div'); sheet.className='gp-sheet'; ov.appendChild(sheet);
    function draw(){
      var anyFee=store.some(function(m){ return feeFor(m.brand); });
      sheet.innerHTML='<div class="gp-hd"><div class="gp-h">Payment method</div><button class="gp-x">&times;</button></div>'
        +'<p class="gp-sub">Choose how to pay for this request.'+(anyFee?' Methods marked <b>Small fee</b> add a small processing surcharge, shown before you confirm.':'')+(store.some(function(m){ return m.brand==='cashapp'; })?' <b>Cash App:</b> cover the cost of items in full — a Cash App request can only be adjusted down, never up.':'')+'</p>'
        +store.map(function(m){ return methodRow(m,{pick:true}); }).join('')
        +'<button class="gp-add" data-add>+ New payment method</button>'
        +'<button class="gp-cta" data-use>Use this method</button>';
      sheet.querySelector('.gp-x').onclick=function(){ ov.remove(); };
      sheet.querySelector('[data-add]').onclick=function(){ openAddModal(function(){ draw(); }); };
      sheet.querySelectorAll('.gp-row[data-act="pick"]').forEach(function(r){ r.onclick=function(){ select(r.getAttribute('data-key')); draw(); }; });
      sheet.querySelector('[data-use]').onclick=function(){ ov.remove(); if(typeof onPicked==='function') onPicked(selected()); };
    }
    draw();
  }

  // ── "+ New payment method" — wallets (quick-connect) + card form (with Scan) ──
  function openAddModal(onSaved){
    var ov=overlay();
    var sheet=document.createElement('div'); sheet.className='gp-sheet'; ov.appendChild(sheet);
    var num='',exp='',cvc='',nm='',addr1='',city='',st='',zip='';
    // G40-11: billing address is required and the card is saved only after the SMS code
    var otpSecs=300, otpTimer=null, otpResent=false;
    function billingValid(){ return !!(addr1.trim()&&city.trim()&&st.trim().length===2&&/^\d{5}(-\d{4})?$/.test(zip.trim())); }
    function formValid(){ var d=String(num).replace(/\D/g,''); return d.length>=15&&/^\d{2}\/\d{2}$/.test(exp)&&cvc.length>=3&&!!nm.trim()&&billingValid(); }
    function drawOtp(){
      clearInterval(otpTimer); otpSecs=300;
      sheet.innerHTML='<div class="gp-hd"><div class="gp-h">Add a payment method</div><button class="gp-x">&times;</button></div>'
        +'<div style="text-align:center;font-weight:800;font-size:17px;color:#002461;padding-top:8px;">Confirm it\'s you</div>'
        +'<div style="text-align:center;padding:6px 4px 0;font-size:13px;color:#74777C;line-height:1.45;">We sent a 6-digit code to the phone on your account (<b>***-***-1234</b>). Enter it to save this card. The card is not saved until the code is confirmed. <em>(Demo: any 6 digits work.)</em></div>'
        +'<div style="display:flex;gap:8px;justify-content:center;margin:14px 0 8px;" id="gp-otp">'+'<input class="gp-in" style="width:38px;height:46px;text-align:center;font-size:20px;font-weight:700;padding:0;" inputmode="numeric" maxlength="1">'.repeat(6)+'</div>'
        +'<div id="gp-otp-meta" style="text-align:center;font-size:12px;color:#74777C;">Code expires in 5:00</div>'
        +'<button class="gp-cta" data-verify disabled style="opacity:.5;">Verify and save card</button>'
        +'<button data-resend style="background:none;border:none;color:#1CB061;font-weight:800;text-decoration:underline;margin-top:6px;">'+(otpResent?'Code already resent once':'Resend code')+'</button>'
        +'<button data-otpcancel style="background:none;border:none;color:#74777C;font-size:12px;margin-top:4px;">Cancel \u2014 don\'t save this card</button>';
      var boxes=Array.prototype.slice.call(sheet.querySelectorAll('#gp-otp input'));
      var code=function(){ return boxes.map(function(b){return b.value;}).join(''); };
      var cta=sheet.querySelector('[data-verify]');
      boxes.forEach(function(b,i){ b.oninput=function(){ b.value=b.value.replace(/\D/g,'').slice(0,1); if(b.value&&boxes[i+1]) boxes[i+1].focus(); var ok=code().length===6&&otpSecs>0; cta.disabled=!ok; cta.style.opacity=ok?'1':'.5'; };
        b.onkeydown=function(e){ if(e.key==='Backspace'&&!b.value&&boxes[i-1]) boxes[i-1].focus(); }; });
      otpTimer=setInterval(function(){ otpSecs=Math.max(0,otpSecs-1); var m=Math.floor(otpSecs/60),s=otpSecs%60; var meta=sheet.querySelector('#gp-otp-meta'); if(!meta){ clearInterval(otpTimer); return; }
        meta.textContent=otpSecs?('Code expires in '+m+':'+(s<10?'0':'')+s):('That code has expired.'+(otpResent?' Add the card again to get a new code.':' Send a new one.')); meta.style.color=otpSecs?'#74777C':'#D0342C'; if(!otpSecs){ cta.disabled=true; cta.style.opacity='.5'; } },1000);
      sheet.querySelector('.gp-x').onclick=function(){ clearInterval(otpTimer); ov.remove(); };
      cta.onclick=function(){ if(code().length!==6) return; clearInterval(otpTimer); saveCard(); ov.remove(); if(onSaved)onSaved(); };
      sheet.querySelector('[data-resend]').onclick=function(){ if(otpResent) return; otpResent=true; drawOtp(); };
      sheet.querySelector('[data-otpcancel]').onclick=function(){ clearInterval(otpTimer); otpResent=false; draw(); };
      boxes[0].focus();
    }
    function walletBtns(){
      return WALLETS.map(function(w){
        return '<button class="gp-wbtn" data-wallet="'+w.brand+'">'+brandMark(w.brand)
          +'<span style="flex:1;text-align:left;">Connect '+w.name+(w.fee?' <span class="gp-badge fee" style="margin-left:4px;">Small fee</span>':'')+'</span><span style="color:#1CB061;font-weight:900;">›</span></button>';
      }).join('');
    }
    function draw(){
      var brand=detectBrand(num)||'visa';
      sheet.innerHTML='<div class="gp-hd"><div class="gp-h">New payment method</div><button class="gp-x">&times;</button></div>'
        +'<div class="gp-sec">Digital wallets &amp; bank pay</div>'+walletBtns()
        +'<div class="gp-sec">Or add a card</div>'
        +'<button class="gp-scan" data-scan>📷 Scan card with camera</button>'
        +'<div class="gp-prev" style="background:'+(MARK_BG[brand]||'#002461')+';"><div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:12px;opacity:.9;">'+(BRAND_NAME[brand]||'Card')+brandMark(brand)+'</div><div class="pn">'+ (fmtNum(num,brand)||'•••• •••• •••• ••••') +'</div><div style="display:flex;justify-content:space-between;font-size:11px;opacity:.85;"><span>'+(nm||'CARDHOLDER NAME')+'</span><span>'+(exp||'MM/YY')+'</span></div></div>'
        +'<div class="gp-fld"><label class="gp-lb">Card number</label><input class="gp-in" id="gp-num" inputmode="numeric" placeholder="1234 5678 9012 3456" value="'+fmtNum(num,brand)+'"></div>'
        +'<div style="display:flex;gap:10px;"><div class="gp-fld" style="flex:1;"><label class="gp-lb">Expiry</label><input class="gp-in" id="gp-exp" inputmode="numeric" placeholder="MM/YY" value="'+exp+'"></div>'
        +'<div class="gp-fld" style="flex:1;"><label class="gp-lb">CVC</label><input class="gp-in" id="gp-cvc" inputmode="numeric" placeholder="'+(brand==='amex'?'4 digits':'3 digits')+'" value="'+cvc+'"></div></div>'
        +'<div class="gp-fld"><label class="gp-lb">Cardholder name</label><input class="gp-in" id="gp-nm" placeholder="Name on card" value="'+nm+'"></div>'
        +'<div class="gp-sec">Billing address (as on the card statement)</div>'
        +'<div class="gp-fld"><label class="gp-lb">Street address</label><input class="gp-in" id="gp-addr1" placeholder="Street address" value="'+addr1+'"></div>'
        +'<div style="display:flex;gap:8px;"><div class="gp-fld" style="flex:2;"><label class="gp-lb">City</label><input class="gp-in" id="gp-city" placeholder="City" value="'+city+'"></div>'
        +'<div class="gp-fld" style="flex:1;"><label class="gp-lb">State</label><input class="gp-in" id="gp-st" placeholder="NC" maxlength="2" value="'+st+'"></div>'
        +'<div class="gp-fld" style="flex:1;"><label class="gp-lb">ZIP</label><input class="gp-in" id="gp-zip" inputmode="numeric" placeholder="27601" maxlength="10" value="'+zip+'"></div></div>'
        +'<div style="font-size:11.5px;color:#74777C;line-height:1.45;padding:0 2px 8px;">Your bank checks this address against the card. After you tap Add card, we text a 6-digit code to the phone on your account to confirm it\'s you before the card is saved.</div>'
        +'<button class="gp-cta" data-savecard'+(formValid()?'':' disabled style="opacity:.5;"')+'>Add card</button>';
      sheet.querySelector('.gp-x').onclick=function(){ ov.remove(); };
      sheet.querySelectorAll('[data-wallet]').forEach(function(b){ b.onclick=function(){ connectWallet(b.getAttribute('data-wallet')); ov.remove(); if(onSaved)onSaved(); }; });
      var ni=sheet.querySelector('#gp-num'); ni.oninput=function(){ num=ni.value; var b=detectBrand(num)||'visa'; var caret=ni.selectionStart; ni.value=fmtNum(num,b); redraw(ni); };
      var ei=sheet.querySelector('#gp-exp'); ei.oninput=function(){ var v=ei.value.replace(/[^0-9]/g,'').slice(0,4); if(v.length>=3) v=v.slice(0,2)+'/'+v.slice(2); exp=v; ei.value=v; };
      var ci=sheet.querySelector('#gp-cvc'); ci.oninput=function(){ cvc=ci.value.replace(/[^0-9]/g,'').slice(0,brand==='amex'?4:3); ci.value=cvc; };
      var mi=sheet.querySelector('#gp-nm'); mi.oninput=function(){ nm=mi.value; refreshCta(); };
      var a1=sheet.querySelector('#gp-addr1'); a1.oninput=function(){ addr1=a1.value; refreshCta(); };
      var ci2=sheet.querySelector('#gp-city'); ci2.oninput=function(){ city=ci2.value; refreshCta(); };
      var si=sheet.querySelector('#gp-st'); si.oninput=function(){ si.value=si.value.replace(/[^a-z]/gi,'').toUpperCase().slice(0,2); st=si.value; refreshCta(); };
      var zi=sheet.querySelector('#gp-zip'); zi.oninput=function(){ zi.value=zi.value.replace(/[^0-9-]/g,'').slice(0,10); zip=zi.value; refreshCta(); };
      ni.addEventListener('input', refreshCta); ei.addEventListener('input', refreshCta); ci.addEventListener('input', refreshCta);
      function refreshCta(){ var c=sheet.querySelector('[data-savecard]'); if(!c) return; var ok=formValid(); c.disabled=!ok; c.style.opacity=ok?'1':'.5'; }
      sheet.querySelector('[data-scan]').onclick=function(){ num='4242424242424242'; exp='09/27'; cvc='123'; nm=nm||'Jamie Lopez'; draw(); };
      // G40-11: a new card is saved only after the SMS code is confirmed
      sheet.querySelector('[data-savecard]').onclick=function(){ if(!formValid()) return; otpResent=false; drawOtp(); };
      function redraw(active){ /* keep the preview live without losing focus on the number field */
        var b=detectBrand(num)||'visa';
        var prev=sheet.querySelector('.gp-prev'); if(prev){ prev.style.background=MARK_BG[b]||'#002461';
          prev.querySelector('.pn').textContent=fmtNum(num,b)||'•••• •••• •••• ••••'; }
      }
    }
    function saveCard(){ var digits=String(num).replace(/\D/g,''); if(digits.length<12){ return; }
      var b=detectBrand(num)||'visa'; var last4=digits.slice(-4);
      add({brand:b, name:BRAND_NAME[b]||'Card', last4:last4, exp:exp||'', cardholder:nm, billing:{line1:addr1.trim(),city:city.trim(),state:st.trim().toUpperCase(),zip:zip.trim()}, sub:'Ending in '+last4+(exp?(' · Exp '+exp):'')}, false);
    }
    draw();
  }
  function connectWallet(brand){ var w=WALLETS.filter(function(x){return x.brand===brand;})[0]||{brand:brand,name:brand,fee:feeFor(brand)};
    if(store.some(function(m){return m.brand===brand;})) { select(store.filter(function(m){return m.brand===brand;})[0].key); return; }
    add({brand:brand, name:w.name, sub:w.sub||'Connected account', wallet:true}, false);
  }

  // ── data API ──
  function methods(){ return store.slice(); }
  function add(entry, makeDefault){ entry.key=entry.key||key(); if(makeDefault||store.length===0){ clearDefault(); entry.isDefault=true; } store.push(entry); selectedKey=entry.key; notify(); return entry.key; }
  function remove(k){ var i=store.findIndex(function(x){return x.key===k;}); if(i<0)return; var wasDef=store[i].isDefault; store.splice(i,1); if(wasDef&&store.length) store[0].isDefault=true; if(selectedKey===k){ var d=store.filter(function(m){return m.isDefault;})[0]||store[0]; selectedKey=d?d.key:null; } notify(); }
  function setDefault(k){ var m=store.filter(function(x){return x.key===k;})[0]; if(!m)return; clearDefault(); m.isDefault=true; notify(); }
  function select(k){ if(store.some(function(m){return m.key===k;})){ selectedKey=k; notify(); } }
  function selected(){ if(!store.some(function(m){return m.key===selectedKey;})){ var d=store.filter(function(m){return m.isDefault;})[0]||store[0]; selectedKey=d?d.key:null; } return store.filter(function(m){return m.key===selectedKey;})[0]||null; }
  function onChange(fn){ if(typeof fn==='function' && listeners.indexOf(fn)<0) listeners.push(fn); }
  function reset(){ store=seed(); selectedKey='pm_visa'; save(); notify(); }

  window.GopherPay={ methods:methods, add:add, remove:remove, setDefault:setDefault, select:select, selected:selected,
    onChange:onChange, feeFor:feeFor, isWallet:isWallet, brandMark:brandMark, WALLETS:WALLETS,
    openManager:openManager, openPicker:openPicker, openAddModal:openAddModal, reset:reset };
})();
