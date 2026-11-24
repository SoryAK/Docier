import { Children, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import "./home-settings-rows.css";

/** The card and row layout shared by Settings and a role's settings. */

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ROW_PADDING = 4;

export function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <VStack gap={1.5}>
      {title != null ? (
        <Text type="supporting" weight="semibold" color="secondary">
          {title}
        </Text>
      ) : null}
      <Card padding={0} width="100%" variant="muted">
        <VStack as="ul" role="list" gap={0}>
          {rows.map((row, index) => (
            <VStack key={index} as="li" gap={0}>
              {index > 0 ? <Divider variant="subtle" /> : null}
              {row}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

export function SettingsRow({
  title,
  description,
  icon,
  control,
  detail,
}: {
  title: string;
  description?: ReactNode;
  icon: IconComponent;
  control?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <VStack padding={ROW_PADDING} gap={2}>
      <HStack className="home-settings-line" gap={3} align="center">
        <HStack className="home-settings-main" gap={2} align="start">
          <VStack paddingBlockStart={0.5}>
            <Icon icon={icon} size="sm" color="secondary" />
          </VStack>
          <VStack gap={0.5} className="home-settings-text">
            <Text type="label">{title}</Text>
            {description != null ? (
              <Text type="supporting" color="secondary">
                {description}
              </Text>
            ) : null}
          </VStack>
        </HStack>
        {control != null ? (
          <VStack className="home-settings-control">{control}</VStack>
        ) : null}
      </HStack>
      {detail}
    </VStack>
  );
}

export function SettingsStatus({ message, error }: { message?: string | null; error?: string | null }) {
  if (!message && !error) return null;
  return (
    <VStack gap={1}>
      {error ? (
        <Text type="supporting" color="secondary" role="alert">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  );
}

