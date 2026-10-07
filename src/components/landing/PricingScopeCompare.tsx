import { PRICING_SCOPE_ROWS } from "./landing-copy";

export function PricingScopeCompare() {
  return (
    <div className="pf-surface rounded-xl p-6 md:p-8">
      <p className="text-sm font-semibold text-[#5EEAD4]">What you are comparing</p>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#A7AFB8]">
        SkyPlanner is scheduling-first. Power BI is reporting-first. Pharmaflow is the operating workspace — planning,
        materials, procurement, batches, and quality on one tenant licence.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] font-medium tracking-wide text-[#A7AFB8] uppercase">
              <th className="pb-3 pr-4 font-medium">Capability</th>
              <th className="pb-3 px-3 font-medium">SkyPlanner APS</th>
              <th className="pb-3 px-3 font-medium">Power BI Pro</th>
              <th className="pb-3 pl-3 font-medium text-[#5B8CFF]">Pharmaflow</th>
            </tr>
          </thead>
          <tbody className="text-[#C5CDD6]">
            {PRICING_SCOPE_ROWS.map((row) => (
              <tr key={row.capability} className="border-b border-white/5">
                <td className="py-3 pr-4 text-[#A7AFB8]">{row.capability}</td>
                <td className="py-3 px-3">{row.sky}</td>
                <td className="py-3 px-3">{row.powerBi}</td>
                <td className="py-3 pl-3 font-medium text-[#F4F7FB]">{row.pharmaflow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-[#7A8490]">
        ERP/MES integration and onboarding are optional services on all paths. Pharmaflow does not replace your ERP — it
        gives operations one governed picture beside it.
      </p>
    </div>
  );
}
