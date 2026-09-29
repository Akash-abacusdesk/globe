import RendererSwitch from "@/components/RendererSwitch";
import GlobalPresence from "@/components/global-presence/GlobalPresence";

export default function WebGLPage() {
  return (
    <main className="flex flex-1 flex-col">
      <RendererSwitch current="webgl" />
      <GlobalPresence renderer="webgl" />
    </main>
  );
}
