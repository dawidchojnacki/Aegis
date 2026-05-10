import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../ui";
import { IconDoc } from "../icons";

export default function Weekly() {
  const [md, setMd] = useState<string | null>(null);
  useEffect(() => {
    api.weekly().then((r) => setMd(r.markdown)).catch(console.error);
  }, []);

  return (
    <Card title="Weekly C-suite report" icon={<IconDoc />}>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
        {md ?? "Loading…"}
      </pre>
    </Card>
  );
}
