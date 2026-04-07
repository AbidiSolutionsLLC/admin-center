// src/pages/overview/OverviewPage.tsx

const OverviewPage = () => {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Overview
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">Welcome to the Admin Center.</p>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-line shadow-card p-6 min-h-[400px]">
        <h2 className="text-sm font-semibold text-ink mb-4">Dashboard</h2>
        <p className="text-sm text-ink-secondary">This is a placeholder for the overview page content.</p>
      </div>
    </div>
  );
};

export default OverviewPage;
