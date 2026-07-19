type StatCardProps = {
  label: string
  value: string
  icon: React.ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps): React.JSX.Element {
  return (
    <div className="border-border/50 bg-card/60 flex items-center gap-3 rounded-lg border px-4 py-3">
      <div className="bg-muted/60 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-foreground text-lg leading-tight font-semibold">{value}</p>
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  )
}
