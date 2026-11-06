// A small modal menu; other modules add their entries with add().

export function createMenu(button, panel) {
  const list = panel.querySelector('ul');
  const open = () => {
    panel.hidden = false;
  };
  const close = () => {
    panel.hidden = true;
  };
  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  return {
    open,
    close,
    /** Adds an entry; `onClick` runs after the menu closes. */
    add(label, onClick) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        close();
        onClick();
      });
      li.append(b);
      list.append(li);
      return b;
    },
  };
}
