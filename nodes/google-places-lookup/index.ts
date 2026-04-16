import type { NodeHandler } from "../../mcp/src/types.js";

type AutocompletePrediction = { place_id: string; description: string };
type AddressComponent = { long_name: string; types: string[] };

const handler: NodeHandler = async ({ input, credentials }) => {
  const address = input.address as string;
  const country = (input.country as string) || "au";
  const apiKey = credentials.GOOGLE_API_KEY;

  if (!address) {
    return { success: false, error: "'address' is required" };
  }

  // 1) Autocomplete
  const autoUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  autoUrl.searchParams.set("input", address);
  autoUrl.searchParams.set("components", `country:${country}`);
  autoUrl.searchParams.set("types", "address");
  autoUrl.searchParams.set("key", apiKey);

  try {
    const autoRes = await fetch(autoUrl.toString());
    if (!autoRes.ok) {
      return { success: false, error: `Places autocomplete HTTP ${autoRes.status}` };
    }

    const autoData = (await autoRes.json()) as { predictions?: AutocompletePrediction[] };
    const predictions = autoData.predictions || [];

    if (predictions.length === 0) {
      return {
        success: true,
        data: { matched: false, formattedAddress: address, alternatives: [] },
      };
    }

    const top = predictions[0];
    const alternatives = predictions.slice(0, 3).map((p) => p.description);

    // 2) Place Details
    const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    detailsUrl.searchParams.set("place_id", top.place_id);
    detailsUrl.searchParams.set("fields", "formatted_address,address_components");
    detailsUrl.searchParams.set("key", apiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    if (!detailsRes.ok) {
      // Autocomplete succeeded but details failed — return description
      return {
        success: true,
        data: { matched: true, formattedAddress: top.description, alternatives },
      };
    }

    const detailsData = (await detailsRes.json()) as {
      result?: { formatted_address?: string; address_components?: AddressComponent[] };
    };

    const result = detailsData.result || {};
    const components = result.address_components || [];
    const get = (type: string) =>
      components.find((c) => c.types.includes(type))?.long_name || "";

    return {
      success: true,
      data: {
        matched: true,
        formattedAddress: result.formatted_address || top.description,
        streetNumber: get("street_number"),
        street: get("route"),
        suburb: get("locality"),
        state: get("administrative_area_level_1"),
        postcode: get("postal_code"),
        alternatives,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Places lookup failed: ${message}` };
  }
};

export default handler;
