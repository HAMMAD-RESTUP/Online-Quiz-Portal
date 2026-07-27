export default function LoadingScreen({ label = "Loading..." }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}
