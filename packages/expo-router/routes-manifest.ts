// no relative imports
import { ctx } from "expo-router/_entry";
// import { ctx } from "expo-router/_entry-ctx-lazy";
import { getMatchableRouteConfigs } from "expo-router/src/fork/getStateFromPath";
import { getReactNavigationConfig } from "expo-router/src/getReactNavigationConfig";
import { getRoutes } from "expo-router/src/getRoutes";
import { loadStaticParamsAsync } from "expo-router/src/loadStaticParamsAsync";
import { matchGroupName } from "expo-router/src/matchers";

export type RouteInfo<TRegex = string> = {
  dynamic:
    | {
        name: string;
        deep: boolean;
      }[]
    | null;
  generated: boolean | undefined;
  type: string;
  file: string;
  regex: TRegex;
  src: string;
};

export type ExpoRoutesManifestV1<TRegex = string> = {
  functions: RouteInfo<TRegex>[];
  staticHtml: RouteInfo<TRegex>[];
  staticHtmlPaths: string[];
};

export async function createRoutesManifest(): Promise<any> {
  let routeTree = getRoutes(ctx, {
    preserveApiRoutes: true,
    ignoreRequireErrors: true,
  });

  if (!routeTree) {
    return null;
  }

  routeTree = await loadStaticParamsAsync(routeTree);

  const config = getReactNavigationConfig(routeTree, false);

  const { configs } = getMatchableRouteConfigs(config);

  const manifest = configs.map((config) => {
    const isApi = config._route!.contextKey?.match(/\+api\.[tj]sx?/);

    const src = config
      ._route!.contextKey.replace(/\.[tj]sx?$/, ".js")
      .replace(/^\.\//, "");

    return {
      dynamic: config._route!.dynamic,
      generated: config._route!.generated,
      type: isApi ? "dynamic" : "static",
      file: config._route!.contextKey,
      regex: config.regex?.source ?? /^\/$/.source,
      src: isApi ? "./_expo/functions/" + src : "./" + src,
    };
  });

  return {
    functions: manifest.filter((v) => v.type === "dynamic"),
    staticHtml: manifest.filter((v) => v.type === "static"),
    staticHtmlPaths: [...getStaticFiles(config)],
  };
}

function getStaticFiles(manifest: any) {
  const files = new Set<string>();

  const sanitizeName = (segment: string) => {
    // Strip group names from the segment
    return segment
      .split("/")
      .map((s) => {
        const d = s.match(/^:(.*)/);
        // if (d) s = ''
        if (d) s = `[${d[1]}]`;
        s = matchGroupName(s) ? "" : s;
        return s;
      })
      .filter(Boolean)
      .join("/");
  };

  const nameWithoutGroups = (segment: string) => {
    // Strip group names from the segment
    return segment
      .split("/")
      .map((s) => (matchGroupName(s) ? "" : s))
      .filter(Boolean)
      .join("/");
  };

  const fetchScreens = (
    screens: Record<string, any>,
    additionPath: string = ""
  ): any[] => {
    function fetchScreenExact(pathname: string, filename: string) {
      const outputPath = [additionPath, filename]
        .filter(Boolean)
        .join("/")
        .replace(/^\//, "");
      // TODO: Ensure no duplicates in the manifest.
      if (!files.has(outputPath)) {
        files.add(outputPath);
      }
    }

    function fetchScreen({
      segment,
      filename,
    }: {
      segment: string;
      filename: string;
    }) {
      // Strip group names from the segment
      const cleanSegment = sanitizeName(segment);

      if (nameWithoutGroups(segment) !== segment) {
        // has groups, should request multiple screens.
        fetchScreenExact(
          [additionPath, segment].filter(Boolean).join("/"),
          filename
        );
      }

      fetchScreenExact(
        [additionPath, cleanSegment].filter(Boolean).join("/"),
        sanitizeName(filename)
      );
    }

    return Object.entries(screens)
      .map(([name, segment]) => {
        const filename = name;

        // Segment is a directory.
        if (typeof segment !== "string") {
          if (Object.keys(segment.screens).length) {
            const cleanSegment = sanitizeName(segment.path);

            return fetchScreens(
              segment.screens,
              [additionPath, cleanSegment].filter(Boolean).join("/")
            );
          } else {
            // skip when extranrous `screens` object exists
            segment = segment.path;
          }
        }

        // TODO: handle dynamic routes
        // if (!segment.startsWith('*')) {
        fetchScreen({ segment, filename });
        // }
        return null;
      })
      .filter(Boolean);
  };

  fetchScreens(manifest.screens);

  return files;
}
