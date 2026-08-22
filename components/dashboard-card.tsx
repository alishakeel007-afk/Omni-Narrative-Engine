type DashboardCardProps = {
  title: string;
  value: string;
  accent?: "gold" | "blue";
};

export function DashboardCard({
  title,
  value,
  accent = "blue"
}: DashboardCardProps) {
  return (
    <article
      className={`glass-panel rounded-[1.75rem] p-5 ${
        accent === "gold" ? "gold-ring" : ""
      }`}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-white/75">{title}</p>
      <h3
        className={`mt-4 text-2xl font-semibold ${
          accent === "gold" ? "text-gold" : "text-white"
        }`}
      >
        {value}
      </h3>
    </article>
  );
}
