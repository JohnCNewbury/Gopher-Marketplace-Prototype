/* ─── Gopher featured-placement bidding brain (shared) ───────────────────────
   One auction, two windows onto it — both LIVE and rendering from here:
     • gopher-deals.html — merchant portal, "Feature my business" board
     • gopher-go.html    — worker dashboard, "Feature my deal" (wired 2026-08-05)
   Both pages must render from THIS module so the standings, badge rules and
   category lock never drift apart. Neither carries auction logic of its own;
   keep it that way. Spec: Gopher-Deals-Build-Spec §6.1.

   Rules encoded here (owner spec, 2026-07-22):
     • "Projected Featured Deal" is always badged on the single highest bid
       across ALL categories.
     • "You're leading!" applies only to the viewer's OWN category, and only
       when the viewer actually holds that category's top bid. The featured
       card never doubles up with the sticker — featured already implies it.
     • A business can only bid in its own category (a restaurant cannot bid
       on Retail Merchants). canBid()/placeBid() enforce this; UIs must not
       offer a bid control where canBid() is false.
     • The category holding the top overall bid also appears as its own card
       showing its second-highest bid, so that category shows twice.

   Prototype data layer: the demo seed below stands in for the auction API.
   Production swaps these tables for live queries behind the same
   window.GopherBidBrain seam (and settles auctions server-side — never trust
   client math for money). `mine` is a single-viewer demo flag; production
   keys placements by merchantId and compares against the signed-in account. */
(function(){
  'use strict';

  var CATS = ['Service Providers','Restaurants & Food Trucks','Local Favorites','Retail Merchants','Age-Restricted'];

  /* Demo seed — viewer is My Way Tavern (Restaurants & Food Trucks).
     Service Providers holds the top overall bid (featured) so its card
     appears twice per the board rule; the viewer leads their own category. */
  var placements = [
    { category:'Service Providers',           amount:500, holder:'Carolina Green Lawns',     mine:false },
    { category:'Restaurants & Food Trucks', amount:410, holder:'You · My Way Tavern', mine:true  },
    { category:'Local Favorites',             amount:300, holder:'A nearby merchant',        mine:false },
    { category:'Service Providers',           amount:260, holder:'A nearby merchant',        mine:false },
    { category:'Retail Merchants',          amount:225, holder:'A nearby merchant',        mine:false },
    { category:'Age-Restricted',              amount:125, holder:'A nearby merchant',        mine:false }
  ];

  /* ⛔ LIVE MODE — the seed above is a SHOWROOM, and showing it to a signed-in
     merchant is the defect, not the fallback.

     The owner signed in on 2026-08-30 and saw "You · My Way Tavern" leading
     Restaurants at $410. None of it was his. On My Deals the same shape merely
     showed the wrong list; here it is worse, because a merchant reads these
     standings and decides what to bid. An invented $410 top bid is a number
     someone spends real money to beat.

     So: when setLive() has been called, EVERY read below answers from the
     server's settlement and the seed is unreachable. The server computes
     featured / leading / mine / canBid in helpers/placement_auction.js and
     returns exactly the fields board() already produced, so nothing downstream
     changes shape — see GET /users/deals/bids/board.

     A page that cannot reach the API must show an error, NOT fall through to the
     seed. isLive() exists so a caller can tell those apart. */
  var LIVE = null;

  function setLive(payload){
    if(!payload || !Array.isArray(payload.board)) return false;
    LIVE = {
      board: payload.board.slice(),
      viewerCategory: payload.viewerCategory || null,
      month: payload.month || null,
      closesOnDay: payload.closesOnDay || 20
    };
    return true;
  }
  function isLive(){ return !!LIVE; }
  function viewerCategory(){ return LIVE ? LIVE.viewerCategory : null; }
  function clearLive(){ LIVE = null; }

  function sorted(){ return placements.slice().sort(function(a,b){ return b.amount-a.amount; }); }

  function topOverall(){ return sorted()[0] || null; }

  function catTop(cat){
    /* Live: the board already holds one card per category, top bid first, so
       the answer is a lookup rather than a recomputation over a seed that is
       no longer the truth. */
    if(LIVE){
      for(var k=0;k<LIVE.board.length;k++){
        var c=LIVE.board[k];
        if(c.category===cat) return { category:c.category, amount:c.amount, holder:c.holder, mine:c.mine };
      }
      return null;
    }
    var top=null;
    placements.forEach(function(p){ if(p.category===cat && (!top || p.amount>top.amount)) top=p; });
    return top; /* null = no bids yet this month */
  }

  function canBid(viewerCat, cat){ return !!viewerCat && viewerCat===cat; }

  function isLeading(viewer){
    var t = catTop((LIVE && LIVE.viewerCategory) || viewer.category);
    return !!(t && t.mine);
  }

  /* Render-ready board for a viewer {name, category}, amount desc:
     the top overall bid (featured), then each category's top bid — which for
     the featured category is its second-highest, so ONLY that category shows
     twice. Lower placements stay off the board. */
  function board(viewer){
    if(LIVE) return LIVE.board.slice();
    var list = sorted();
    if(!list.length) return [];
    var cards=[list[0]], seen={};
    list.slice(1).forEach(function(p){
      if(seen[p.category]) return;
      seen[p.category]=true;
      cards.push(p);
    });
    return cards.map(function(p, i){
      var featured = (i===0);
      var own = (p.category===viewer.category);
      var t = catTop(p.category);
      var leads = own && p.mine && t && t.amount===p.amount;
      return {
        category: p.category,
        amount:   p.amount,
        holder:   p.holder,
        mine:     p.mine,
        featured: featured,
        leading:  leads && !featured, /* featured already implies it */
        own:      own,
        canBid:   canBid(viewer.category, p.category)
      };
    });
  }

  /* Category-locked bid. Replaces the viewer's category-top entry when the
     bid takes the lead; otherwise records it as a non-leading placement.
     TODO(backend): POST { dealId, category, amount, month } and settle the
     monthly auction server-side. */
  function placeBid(viewer, category, amount){
    /* ⛔ NEVER SETTLE A LIVE AUCTION IN THE BROWSER. On a live board this refuses
       rather than guessing: the server records the bid, decides whether it leads,
       and is the only thing that can (POST /users/deals/bids). A client that
       mutated its copy would show the merchant a lead they may not hold, and the
       correction would arrive a month later as a lost month.

       Refusing loudly beats returning a plausible object — a caller that has not
       been updated to use the API fails visibly here instead of quietly
       displaying arithmetic as fact. */
    if(LIVE) return { ok:false, reason:'server-only' };
    amount = parseInt(amount,10);
    if(!canBid(viewer.category, category)) return { ok:false, reason:'category-locked' };
    if(!amount || amount<1) return { ok:false, reason:'amount' };
    var t = catTop(category);
    var beatsTop = !t || amount > t.amount;
    var entry = { category:category, amount:amount, holder:'You · '+viewer.name, mine:true };
    if(beatsTop){
      var idx=-1, mx=-1;
      placements.forEach(function(p,i){ if(p.category===category && p.amount>mx){ mx=p.amount; idx=i; } });
      if(idx>=0){ placements[idx]=entry; } else { placements.push(entry); }
    }
    /* ⛔ THIS COMMENT USED TO READ: "Non-leading bids still win a featured slot
       this month (guaranteed-win copy)". Ruling 7 (owner, 2026-08-05) retired
       that promise as FALSE: one winner per category, plus the top overall bid
       as its own Featured Deal. A losing bid is a losing bid.

       `ok` means RECORDED, never WON — the caller must render `leading`, not
       treat ok as a win. Production settles this server-side
       (helpers/placement_auction.js) and the API answers with the same
       `leading` flag, so the two cannot drift into telling a merchant different
       things about the same bid. */
    return { ok:true, beatsTop:beatsTop, leading:beatsTop };
  }

  /* Bidding closes on the 20th of each month — label the next close. */
  function closeLabel(){
    var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now=new Date(), m=now.getMonth(), y=now.getFullYear();
    if(now.getDate()>20){ m++; if(m>11){ m=0; y++; } }
    return 'Bidding closes '+MONTHS[m]+' 20th, '+y;
  }

  /* ⚠️ THE CLOSE DATE ALONE IS AMBIGUOUS, and on the 21st it actively misleads.
     The round runs 21st -> 20th and places on the 1st of the month AFTER it
     closes (owner, 2026-08-17): bids close August 20th for a SEPTEMBER 1st
     placement; at 12:01am on August 21st the board resets to $0 for OCTOBER 1st.

     So a worker bidding on the 21st sees a board freshly at zero and, with only
     "the top bidder goes live on the 1st" to go on, reasonably concludes they
     are buying the 1st that is nine days away — which closed and billed the
     night before. They would expect placement in 9 days and get it in 40.

     Returning BOTH dates from the same computation is the fix; a surface that
     shows one without the other reintroduces the ambiguity. Additive to the
     brain rather than written per-page so the Deals board gets it too. */
  function placementLabel(){
    var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now=new Date(), m=now.getMonth(), y=now.getFullYear();
    if(now.getDate()>20){ m++; if(m>11){ m=0; y++; } }   /* the close month */
    m++; if(m>11){ m=0; y++; }                            /* placement is the NEXT 1st */
    return MONTHS[m]+' 1st, '+y;
  }

  /* One line carrying both halves of the cycle, so neither can be shown alone. */
  function cycleLabel(){
    return closeLabel() + ' \u2192 winners go live ' + placementLabel();
  }

  window.GopherBidBrain = {
    setLive: setLive,
    isLive: isLive,
    clearLive: clearLive,
    viewerCategory: viewerCategory,
    placementLabel: placementLabel,
    cycleLabel: cycleLabel,
    CATS: CATS.slice(),
    board: board,
    catTop: catTop,
    topOverall: topOverall,
    canBid: canBid,
    isLeading: isLeading,
    placeBid: placeBid,
    closeLabel: closeLabel
  };
})();
