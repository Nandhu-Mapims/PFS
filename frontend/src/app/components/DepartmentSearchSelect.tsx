import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

type DepartmentOption = { _id: string; name: string };

type DepartmentSearchSelectProps = {
  departments: DepartmentOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function DepartmentSearchSelect({
  departments,
  value,
  onChange,
  placeholder = "Department (optional)",
}: DepartmentSearchSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-full p-4 text-lg border-2 border-gray-300 rounded-2xl outline-none transition-all bg-white text-left flex items-center justify-between gap-2 hover:border-gray-400 focus:border-[#2A6FDB] focus:shadow-[0_0_0_4px_#2A6FDB33]"
        >
          <span className={value ? "text-gray-900 truncate" : "text-gray-400"}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-5 w-5 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search department…" className="h-11" />
          <CommandList>
            <CommandEmpty>No department found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <span className="text-gray-500">{placeholder}</span>
              </CommandItem>
              {departments.map((d) => (
                <CommandItem
                  key={d._id}
                  value={d.name}
                  onSelect={() => {
                    onChange(d.name === value ? "" : d.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === d.name ? "opacity-100" : "opacity-0")}
                  />
                  {d.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
