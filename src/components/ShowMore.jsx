export default function ShowMore({ shown, total, label, listId, onMore }) {
  if (total <= shown) return null;
  return <div className="list-more">
    <span role="status">Показано {shown} из {total}</span>
    <button type="button" className="btn-secondary" onClick={() => {
      onMore();
      requestAnimationFrame(() => {
        const next = document.getElementById(listId)?.children[shown]?.querySelector('button');
        next?.focus({ preventScroll: true });
        next?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    }}>Показать ещё {label}</button>
  </div>;
}
