// Polyfill for matchMedia which is often missing or incomplete in some environments
if (typeof window !== 'undefined') {
  const polyfill = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: function(cb: any) {
      if (typeof cb === 'function') this.addEventListener('change', cb);
      else if (cb && typeof cb.handleEvent === 'function') this.addEventListener('change', (e: any) => cb.handleEvent(e));
    },
    removeListener: function(cb: any) {
      if (typeof cb === 'function') this.removeEventListener('change', cb);
      else if (cb && typeof cb.handleEvent === 'function') this.removeEventListener('change', (e: any) => cb.handleEvent(e));
    },
    addEventListener: function(type: string, cb: any) {
      // Basic event handling if needed, but usually just for 'change'
    },
    removeEventListener: function(type: string, cb: any) {},
    dispatchEvent: function() { return false; },
  });

  if (!window.matchMedia) {
    window.matchMedia = polyfill as any;
  } else {
    // It exists, but we need to make sure addListener/removeListener exist
    const original = window.matchMedia;
    window.matchMedia = function(query) {
      let mql;
      try {
        mql = original.call(window, query);
      } catch (e) {
        mql = polyfill(query);
      }
      
      if (!mql) {
        mql = polyfill(query);
      }

      if (mql && !mql.addListener) {
        mql.addListener = function(cb: any) {
          if (typeof cb === 'function') this.addEventListener('change', cb);
          else if (cb && typeof cb.handleEvent === 'function') this.addEventListener('change', (e: any) => cb.handleEvent(e));
        };
      }
      if (mql && !mql.removeListener) {
        mql.removeListener = function(cb: any) {
          if (typeof cb === 'function') this.removeEventListener('change', cb);
          else if (cb && typeof cb.handleEvent === 'function') this.removeEventListener('change', (e: any) => cb.handleEvent(e));
        };
      }
      return mql;
    };
  }
}
export {};
