const cx = (...classes) => classes.filter(Boolean).join(' ');

function PageFrame({ children, width = 'wide', className }) {
  const widthClass = width === 'full' ? 'max-w-none' : 'max-w-6xl';

  return (
    <div
      className={cx(
        'min-h-screen w-full bg-[radial-gradient(circle_at_top,_#f7f2ea_0%,_#e5d6c5_50%,_#c8b097_100%)] text-[#2f2a23]',
        className
      )}
    >
      <div className={cx('mx-auto w-full px-6 py-10', widthClass)}>
        {children}
      </div>
    </div>
  );
}

function PageHeader({ eyebrow = 'SlugCruise', title, subtitle, className }) {
  return (
    <header className={cx('space-y-2', className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.38em] text-[#6f604f]">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      {subtitle && <p className="text-sm text-[#5a4e41]">{subtitle}</p>}
    </header>
  );
}

function SurfaceCard({ children, className }) {
  return (
    <div
      className={cx(
        'rounded-3xl border border-[#d7c5b1] bg-[#fbf7f0] p-5 shadow-[0_16px_34px_rgba(68,54,41,0.2)]',
        className
      )}
    >
      {children}
    </div>
  );
}

function GlassCard({ children, className }) {
  return (
    <div
      className={cx(
        'rounded-3xl border border-white/55 bg-white/35 p-5 shadow-[0_20px_45px_rgba(73,61,50,0.25)] backdrop-blur-2xl',
        className
      )}
    >
      {children}
    </div>
  );
}

export { PageFrame, PageHeader, SurfaceCard, GlassCard, cx };
