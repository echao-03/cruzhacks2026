import { SurfaceCard } from './ui';

function SeatCubes({ available = 0, total = 4 }) {
  const current = Number(available);
  const max = Number(total);

  const cubes = Array.from({ length: max }, (_, index) => ({
    id: index,
    filled: index < current,
  }));

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {cubes.map((cube) => (
          <span
            key={cube.id}
            className={`h-3.5 w-3.5 shrink-0 rounded-[5px] border ${
              cube.filled
                ? 'border-[#7a5d46] bg-[#9a7a5f]'
                : 'border-[#c7b29d] bg-transparent'
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-[#6a5c4b]">
        {current}/{max}
      </span>
    </div>
  );
}

function DriverCard({ driver, onSelect, isSelected }) {
  const isInteractive = Boolean(onSelect);
  const handleKeyDown = (event) => {
    if (!isInteractive) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(driver);
    }
  };

  return (
    <SurfaceCard
      className={`p-4 transition ${
        isInteractive ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${isSelected ? 'border-[#7a5d46] shadow-[0_18px_32px_rgba(68,54,41,0.25)]' : ''}`}
      onClick={isInteractive ? () => onSelect(driver) : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#3b3127]">
            {driver.name}
          </p>
          <p className="text-xs text-[#6a5c4b]">
            {driver.destination} / {driver.meetTime}
          </p>
        </div>
        <SeatCubes
          available={driver.availableSeats}
          total={driver.totalSeats}
        />
      </div>
    </SurfaceCard>
  );
}

export default DriverCard;
