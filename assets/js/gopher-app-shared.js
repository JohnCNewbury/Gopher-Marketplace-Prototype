/* ═══════════════════════════════════════════════════════════════════════════
   gopher-app-shared.js — the Request APP's own helpers, published to the page.

   Owner ruling (John, 2026-10-15): "Port the app's logic + drop the demos".
   The requester dashboard does not re-write the app's after-submit rules; it
   runs the app's files. They live in ./app-shared/, copied byte for byte from
   gopher-mobile-request by scripts/sync-app-helpers.py (only the import paths
   gain ".js"); scripts/web-checks/app-shared-helpers.js fails if a copy stops
   matching the app. Never edit them here: change the app and re-run the sync.

   The dashboard's scripts are classic scripts, so this module hands them the
   helpers on window.GopherAppShared and then fires "gopher-app-shared-ready"
   (a module runs after the page has parsed, so anything that rendered earlier
   re-renders on that event).

   What each one decides (audit E, 2026-10-15):
     cardModel / orderCards / headline   the Home card: pill, sentence, colour,
                                         order, "N need you"   (E-47..E-51)
     orderScreenState                    which screen a tap opens: the live view,
                                         confirm/dispute, support-owned dispute,
                                         a decided dispute     (E-35, E-41, E-43)
     liveSteps / itemStep                the live step bar      (E-33)
     requesterCanCancel                  may the requester cancel (E-11, E-12)
     REQUESTER_REASONS / REPOST_REASONS  the cancel reasons and the "Other" rule
       / isReasonComplete                                       (E-13, E-14)
     DISPUTE_REASONS / disputeText /     the dispute form and the 24 h wait
       escalationLabel                   before "Unable to resolve" (E-38, E-40)
     disputeReasonProblem                the server's 10-character floor for a
                                         dispute reason, and its sentence (E-38)
     disputeResolution / disputeOpen     decided vs open dispute
     photoStepUnresolved                 confirm waits for the photo step (E-35)
   ═══════════════════════════════════════════════════════════════════════════ */
import {
  cardModel,
  cardTitle,
  orderCards,
  headline,
  openFor,
  scheduleWords,
} from "./app-shared/component/home/homeCards.js";
import { orderScreenState } from "./app-shared/component/home/openRequest.js";
import { liveSteps, itemStep, ORDER_STATE } from "./app-shared/component/live/liveStatus.js";
import {
  DISPUTE_REASONS,
  disputeText,
  disputeReasonProblem,
  escalationLabel,
} from "./app-shared/component/live/dispute.js";
import { disputeResolution, disputeOpen } from "./app-shared/helpers/disputeState.js";
import { photoStepUnresolved } from "./app-shared/helpers/photoStep.js";
import { categoryLabel } from "./app-shared/helpers/categoryLabel.js";
import {
  REQUESTER_CANCELLABLE_STATES,
  requesterCanCancel,
} from "./app-shared/services/requesterCancelWindow.js";
import {
  REQUESTER_REASONS,
  REPOST_REASONS,
  MAX_REASON_LENGTH,
  MIN_REASON_WORDS,
  isReasonComplete,
  repostNeedsReason,
} from "./app-shared/services/cancelReasons.js";

const api = Object.freeze({
  cardModel,
  cardTitle,
  orderCards,
  headline,
  openFor,
  scheduleWords,
  orderScreenState,
  liveSteps,
  itemStep,
  ORDER_STATE,
  DISPUTE_REASONS,
  disputeText,
  disputeReasonProblem,
  escalationLabel,
  disputeResolution,
  disputeOpen,
  photoStepUnresolved,
  categoryLabel,
  REQUESTER_CANCELLABLE_STATES,
  requesterCanCancel,
  REQUESTER_REASONS,
  REPOST_REASONS,
  MAX_REASON_LENGTH,
  MIN_REASON_WORDS,
  isReasonComplete,
  repostNeedsReason,
});

window.GopherAppShared = api;
window.dispatchEvent(new CustomEvent("gopher-app-shared-ready"));
