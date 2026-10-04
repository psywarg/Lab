// src/utils/site/scrollLock.ts

let lockCount = 0;
let savedScrollY = 0;

export function lockScroll(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = "100%";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  lockCount += 1;
}

export function unlockScroll(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.paddingRight = "";
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, savedScrollY);
  requestAnimationFrame(() => {
    document.documentElement.style.scrollBehavior = "";
  });
}
