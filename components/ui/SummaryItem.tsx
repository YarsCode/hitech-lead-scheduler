interface SummaryItemProps {
  label: string;
  value: string;
}

export function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="font-medium text-primary">{value}</span>
    </div>
  );
}

