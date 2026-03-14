export function StartIcon() {
  return <div className="w-4 h-4 rounded-full border-2 border-white bg-green-500" />;
}

export function EndIcon() {
  return (
    <div className="w-4 h-4 rounded-full border-2 border-white overflow-hidden grid grid-cols-3">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-black'} />
      ))}
    </div>
  );
}
