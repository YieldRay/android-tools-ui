import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { NavigationRail, NavigationBar } from "soda-material";
import { useWindowSizeType } from "soda-material/dist/hooks/use-media-query";
import Icon from "@mdi/react";
import { mdiCellphone, mdiToolboxOutline, mdiPackageVariant } from "@mdi/js";

const navItems = [
  { key: "/sdk", label: "SDK", icon: <Icon path={mdiPackageVariant} size={1} /> },
  { key: "/avd", label: "AVD", icon: <Icon path={mdiCellphone} size={1} /> },
  { key: "/tools", label: "Tools", icon: <Icon path={mdiToolboxOutline} size={1} /> },
];

function RootLayout() {
  const sizeType = useWindowSizeType();
  const compact = sizeType === "compact";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = navItems.map((item) => ({
    ...item,
    active: pathname === item.key || pathname.startsWith(item.key + "/"),
  }));

  const handleChange = (item: { key: React.Key }) => {
    navigate({ to: item.key as string });
  };

  if (compact) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
        <NavigationBar items={items} onChange={handleChange} />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <NavigationRail fab={null} items={items} onChange={handleChange} />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
