import type { UserRow } from "../lib/api";

type HodAssignSelectProps = {
  value: string;
  onChange: (value: string) => void;
  hodUsers: UserRow[];
  className?: string;
};

export function HodAssignSelect({ value, onChange, hodUsers, className }: HodAssignSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        "w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#2A6FDB] outline-none bg-white"
      }
    >
      <option value="">No HOD assigned</option>
      {hodUsers.map((u) => (
        <option key={u._id} value={u._id}>
          {u.username}
        </option>
      ))}
    </select>
  );
}
