import type { KidnappingPolicy, KidnappingPolicyMode, Member } from "@workhard/shared";

const policyOptions: Array<{ value: KidnappingPolicyMode; label: string }> = [
  { value: "allow_all", label: "Everyone" },
  { value: "allow_list", label: "Allow list" },
  { value: "block_list", label: "Block list" },
  { value: "allow_none", label: "No one" },
];

export function PolicyEditor({
  label,
  policy,
  members,
  onChange,
}: {
  label: string;
  policy: KidnappingPolicy;
  members: Member[];
  onChange: (policy: KidnappingPolicy) => void;
}) {
  const showMembers = policy.mode === "allow_list" || policy.mode === "block_list";
  return (
    <div className="kidnapping-policy">
      <label>
        <span>{label}</span>
        <select
          value={policy.mode}
          onChange={(event) => onChange({ mode: event.target.value as KidnappingPolicyMode, userIds: policy.userIds })}
        >
          {policyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {showMembers && (
        <div className="kidnapping-member-list">
          {members.map((member) => (
            <label className="permission-toggle" key={member.id}>
              <input
                type="checkbox"
                checked={policy.userIds.includes(member.id)}
                onChange={(event) => onChange({
                  ...policy,
                  userIds: event.target.checked
                    ? [...policy.userIds, member.id]
                    : policy.userIds.filter((userId) => userId !== member.id),
                })}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
