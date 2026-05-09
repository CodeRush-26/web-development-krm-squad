import { useState } from 'react';

export function CommandSearch({ onRunCommand }) {
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onRunCommand(value.trim());
  }

  return (
    <form className="command-search" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Try: "closest ship to Aurora" · Clear with "clear filter" or the Clear focus button'
      />
      <button type="submit" className="tool-btn">
        Run
      </button>
    </form>
  );
}
