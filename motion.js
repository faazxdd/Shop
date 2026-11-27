/* Storefront motion. Application state never depends on an animation finishing. */
const motionReduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionPulses = new WeakMap();

function motionPulse(element) {
  if (!element || motionReduced.matches || !element.animate) return;
  motionPulses.get(element)?.cancel();
  const animation = element.animate(
    [{transform:'scale(1)'},{transform:'scale(1.17)',offset:0.45},{transform:'scale(1)'}],
    {duration:280,easing:'ease'}
  );
  motionPulses.set(element, animation);
}

const motionCards = new WeakSet();
function animateNewCards(nodes) {
  const positions = new Map();
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    const cards = node.matches('.pc') ? [node] : node.querySelectorAll('.pc');
    for (const card of cards) {
      if (!card.isConnected || motionCards.has(card)) continue;
      motionCards.add(card);
      const parent = card.parentElement;
      const index = positions.get(parent) || 0;
      positions.set(parent, index + 1);
      card.style.setProperty('--card-delay', Math.min(index, 5) * 65 + 'ms');
      card.classList.add('motion-card');
    }
  }
}
new MutationObserver(records => animateNewCards(records.flatMap(record => [...record.addedNodes])))
  .observe(document.querySelector('main'), {childList:true,subtree:true});

function motionDock(dock) {
  const links = [...dock.querySelectorAll('a')];
  const index = links.findIndex(link => link.classList.contains('on'));
  let previous = index;
  try {
    const stored = sessionStorage.getItem('fc-active-tab');
    if (stored !== null && /^[0-4]$/.test(stored)) previous = Number(stored);
    if (index >= 0) sessionStorage.setItem('fc-active-tab', String(index));
  } catch { /* Storage is optional. */ }
  if (index < 0) return;
  const indicator = document.createElement('span');
  indicator.className = 'motion-dock-indicator';
  indicator.setAttribute('aria-hidden','true');
  indicator.style.setProperty('--active-index', index);
  indicator.style.setProperty('--previous-index', previous);
  dock.prepend(indicator);
  links[index].setAttribute('aria-current','page');
}

const cartChanges = new Map();
const stockCeilings = new Map();
const cartLimit = id => Math.min(Shop.cart.MAX_QUANTITY,stockCeilings.get(id)?.quantity ?? Infinity);

// The public catalogue exposes stock status, not the available count. Use the
// existing read-only quote endpoint for each increase before saving locally.
function changeCartQuantity(id, delta) {
  const previous = cartChanges.get(id) || Promise.resolve();
  const change = previous.catch(() => {}).then(async () => {
    const quantity = Shop.cart.get().find(line => line.product_id === id)?.quantity || 0;
    const next = delta > 0 ? Math.max(quantity, Math.min(cartLimit(id), quantity + delta)) : Math.max(0, quantity + delta);
    if (next === quantity) return 0;
    if (delta > 0) {
      try {
        await Shop.quote('', [{product_id:id,quantity:next}]);
      } catch (error) {
        if (/not enough stock/i.test(errMsg(error))) {
          if (delta === 1) {
            const ceiling={quantity};
            stockCeilings.set(id,ceiling);
            setTimeout(()=>{
              if(stockCeilings.get(id)!==ceiling)return;
              stockCeilings.delete(id);
              window.dispatchEvent(new Event('cart-stock-limit'));
            },60000);
          }
          window.dispatchEvent(new Event('cart-stock-limit'));
        }
        throw error;
      }
      // Re-read in case a different tab changed the cart during the quote.
      const current = Shop.cart.get().find(line => line.product_id === id)?.quantity || 0;
      if (current >= next) return 0;
      Shop.cart.add(id,next-current);
      return next-current;
    }
    Shop.cart.setQty(id,next);
    return next-quantity;
  });
  cartChanges.set(id,change);
  const clear = () => { if (cartChanges.get(id) === change) cartChanges.delete(id); };
  change.then(clear,clear);
  return change;
}
