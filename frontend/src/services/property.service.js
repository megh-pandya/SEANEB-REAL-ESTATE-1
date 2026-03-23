import api from "@/lib/api/client";
import { removeCookie, getCookie, setCookie } from "@/lib/core/cookies";

export const DASHBOARD_MODE_USER = "user";
export const DASHBOARD_MODE_BUSINESS = "business";

const DASHBOARD_MODE_COOKIE = "dashboard_mode";
const BUSINESS_REGISTERED_COOKIE = "business_registered";

export const getDashboardMode = () => {
  const mode = String(getCookie(DASHBOARD_MODE_COOKIE) || "").trim().toLowerCase();
  if (mode === DASHBOARD_MODE_BUSINESS) return DASHBOARD_MODE_BUSINESS;
  return DASHBOARD_MODE_USER;
};

export const setDashboardMode = (mode) => {
  const safeMode = mode === DASHBOARD_MODE_BUSINESS ? DASHBOARD_MODE_BUSINESS : DASHBOARD_MODE_USER;
  setCookie(DASHBOARD_MODE_COOKIE, safeMode, { maxAge: 60 * 60 * 24 * 30, path: "/" });
  return safeMode;
};

export const isBusinessRegistered = () => getCookie(BUSINESS_REGISTERED_COOKIE) === "true";

const PRODUCT_KEY = "property";
const PRODUCT_NAME = "property";
let inMemoryProductKey = PRODUCT_KEY;

const normalizeKey = (key) => String(key || "").trim().toLowerCase();
const isAllowedKey = (key) => normalizeKey(key) === PRODUCT_KEY;

const selectSingleProperty = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const property = list.find((item) => normalizeKey(item?.product_key) === PRODUCT_KEY);
  if (property) {
    return [
      {
        ...property,
        product_key: PRODUCT_KEY,
        product_name: PRODUCT_NAME,
      },
    ];
  }
  return [{ product_key: PRODUCT_KEY, product_name: PRODUCT_NAME }];
};

const getStoredProductKey = () => (isAllowedKey(inMemoryProductKey) ? inMemoryProductKey : "");

export const setDefaultProductKey = () => {
  inMemoryProductKey = PRODUCT_KEY;
  removeCookie("product_key");
};

export const getDefaultProductKey = () => {
  const key = getStoredProductKey() || PRODUCT_KEY;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("product_key");
    } catch {
      // ignore
    }
  }
  setDefaultProductKey();
  return key;
};

export const getDefaultProductName = () => PRODUCT_NAME;

const createDefaultProduct = async () => {
  try {
    await api.post("/products", {
      product_key: PRODUCT_KEY,
      product_name: PRODUCT_NAME,
    });
    return true;
  } catch (err) {
    if (err?.response?.status === 409) return true;
    return false;
  }
};

const normalizeProducts = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.products)) return payload.data.products;
  if (Array.isArray(payload?.data?.product)) return payload.data.product;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.product)) return payload.product;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const dedupeProducts = (products = []) => {
  const seen = new Set();
  return (Array.isArray(products) ? products : []).filter((item) => {
    const key = String(item?.product_id || item?.id || item?.product_key || "").trim();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getProducts = async () => {
  const productKey = getDefaultProductKey() || PRODUCT_KEY;
  const attempts = [
    () =>
      api.get("/products", {
        params: { product_key: productKey },
        timeout: 8000,
      }),
    () => api.get("/products", { timeout: 8000 }),
  ];

  try {
    let lastError = null;

    for (const run of attempts) {
      try {
        const response = await run();
        const products = dedupeProducts(normalizeProducts(response?.data));
        if (products.length > 0) return products;
      } catch (error) {
        const status = Number(error?.response?.status || 0);
        if (status === 401 || status === 403) throw error;
        lastError = error;
      }
    }

    const created = await createDefaultProduct();
    if (created) {
      for (const run of attempts) {
        try {
          const response = await run();
          const products = dedupeProducts(normalizeProducts(response?.data));
          if (products.length > 0) return products;
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status === 401 || status === 403) throw error;
          lastError = error;
        }
      }
    }

    if (lastError) {
      console.error("Failed to fetch products:", {
        status: Number(lastError?.response?.status || 0),
        code: lastError?.response?.data?.code,
        message: lastError?.response?.data?.message,
        errorMessage: lastError?.message,
      });
    }

    return selectSingleProperty([]);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 401 || status === 403) {
      throw error;
    }

    console.error("Failed to fetch products:", {
      status,
      code: error?.response?.data?.code,
      message: error?.response?.data?.message,
      errorMessage: error?.message,
    });
    return selectSingleProperty([]);
  }
};

export const getProductById = async (productId) => {
  try {
    if (!productId) {
      throw new Error("Product ID is required");
    }

    const productKey = getDefaultProductKey() || PRODUCT_KEY;
    const response = await api.get(`/products/${productId}`, {
      params: { product_key: productKey },
      timeout: 8000,
    });

    return response?.data || null;
  } catch (error) {
    console.error(`Failed to fetch product ${productId}:`, {
      status: error?.response?.status,
      message: error?.response?.data?.message || error?.message,
    });

    return null;
  }
};

export const searchProducts = async (query) => {
  try {
    if (!query) {
      throw new Error("Search query is required");
    }

    const productKey = getDefaultProductKey() || PRODUCT_KEY;
    const response = await api.get("/products/search", {
      params: {
        query: String(query).trim(),
        product_key: productKey,
      },
      timeout: 8000,
    });

    return normalizeProducts(response?.data);
  } catch (error) {
    console.error("Search failed:", {
      status: error?.response?.status,
      message: error?.response?.data?.message || error?.message,
    });

    return [];
  }
};

export const getCities = async (input) => {
  if (typeof input !== "string" || input.trim().length < 2) {
    return [];
  }

  try {
    const res = await api.get("/cities", {
      params: {
        search: input.trim(),
        limit: 20,
      },
    });

    const body = res?.data;
    const cities = Array.isArray(body) ? body : body?.cities || [];

    if (Array.isArray(cities) && cities.length > 0) {
      return cities;
    }

    const fallback = await api.get("/autocomplete-cities", {
      params: {
        input: input.trim(),
      },
    });
    const fallbackCities = fallback?.data?.cities;

    return Array.isArray(fallbackCities) ? fallbackCities : [];
  } catch (error) {
    console.error(" getCities failed:", error?.response?.data || error?.message || error);
    return [];
  }
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map();
const inflightRequests = new Map();

const toText = (value) => String(value || "").trim();

const toSlug = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/\s+/g, "-");

const toTitle = (value) =>
  toText(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const unique = (list) => Array.from(new Set(list.filter(Boolean)));

const toCacheRecord = (data) => ({ data, expiresAt: Date.now() + CACHE_TTL_MS });

const getCachedData = (path) => {
  const mem = memoryCache.get(path);
  if (mem && Date.now() <= mem.expiresAt) return mem.data;
  if (mem) memoryCache.delete(path);
  return null;
};

const setCachedData = (path, data) => {
  const record = toCacheRecord(data);
  memoryCache.set(path, record);
};

const getProductKeyCandidates = () => {
  const base = toText(getDefaultProductKey()) || "property";
  return unique([base]);
};

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.countries)) return payload.countries;
  if (Array.isArray(payload?.states)) return payload.states;
  if (Array.isArray(payload?.cities)) return payload.cities;
  if (Array.isArray(payload?.areas)) return payload.areas;
  if (Array.isArray(payload?.businesses)) return payload.businesses;
  return [];
};

const getTypedSlug = (row, type) => {
  if (type === "country") {
    return row.country_slug || row.slug || row.code || row.iso2 || row.iso_code;
  }

  if (type === "state") {
    return row.state_slug || row.slug;
  }

  if (type === "city") {
    return row.city_slug || row.slug;
  }

  if (type === "area") {
    return row.area_slug || row.slug;
  }

  return (
    row.slug ||
    row.country_slug ||
    row.state_slug ||
    row.city_slug ||
    row.area_slug ||
    row.code ||
    row.iso2 ||
    row.iso_code
  );
};

const getTypedName = (row, type) => {
  if (type === "country") return row.country_name || row.name || row.label || row.title;
  if (type === "state") return row.state_name || row.name || row.label || row.title;
  if (type === "city") return row.city_name || row.name || row.label || row.title;
  if (type === "area") return row.area_name || row.name || row.label || row.title;

  return (
    row.name ||
    row.country_name ||
    row.state_name ||
    row.city_name ||
    row.area_name ||
    row.title ||
    row.label
  );
};

const normalizeLocation = (item, type) => {
  const row = item || {};
  const slug = getTypedSlug(row, type);
  const name = getTypedName(row, type);

  const normalizedSlug = toSlug(slug || name);

  return {
    slug: normalizedSlug,
    name: toText(name) || toTitle(normalizedSlug),
    type,
    raw: row,
  };
};

const FALLBACK_COUNTRY_ROWS = [
  {
    country_name: "India",
    country_slug: "in",
    code: "IN",
    iso2: "IN",
    iso_code: "IN",
  },
];

const getFallbackCountries = () =>
  FALLBACK_COUNTRY_ROWS.map((item) => normalizeLocation(item, "country"));

const fetchLocationPath = async (path) => {
  const cached = getCachedData(path);
  if (cached) return cached;

  if (inflightRequests.has(path)) {
    return inflightRequests.get(path);
  }

  const requestPromise = api
    .get(path, { timeout: 8000 })
    .then((response) => {
      const normalized = normalizeList(response?.data);
      setCachedData(path, normalized);
      return normalized;
    })
    .finally(() => {
      inflightRequests.delete(path);
    });

  inflightRequests.set(path, requestPromise);
  return requestPromise;
};

const requestLocation = async (pathFactory) => {
  const productKeys = getProductKeyCandidates();
  let lastError = null;

  for (const productKey of productKeys) {
    try {
      const path = pathFactory(productKey);
      const data = await fetchLocationPath(path);
      return { productKey, data };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const fetchLocationRawPath = async (path) => {
  const cached = getCachedData(path);
  if (cached) return cached;

  if (inflightRequests.has(path)) {
    return inflightRequests.get(path);
  }

  const requestPromise = api
    .get(path, { timeout: 8000 })
    .then((response) => {
      const payload = response?.data ?? null;
      setCachedData(path, payload);
      return payload;
    })
    .finally(() => {
      inflightRequests.delete(path);
    });

  inflightRequests.set(path, requestPromise);
  return requestPromise;
};

const requestLocationRaw = async (pathFactory) => {
  const productKeys = getProductKeyCandidates();
  let lastError = null;

  for (const productKey of productKeys) {
    try {
      const path = pathFactory(productKey);
      const data = await fetchLocationRawPath(path);
      return { productKey, data };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const getCountries = async () => {
  try {
    const result = await requestLocation((productKey) => `/location/${productKey}/countries`);
    const countries = result.data.map((item) => normalizeLocation(item, "country"));
    return countries.length > 0 ? countries : getFallbackCountries();
  } catch (error) {
    console.warn("[location] getCountries fallback engaged", {
      status: Number(error?.response?.status || 0),
      message:
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown location error",
    });
    return getFallbackCountries();
  }
};

export const getStates = async (countrySlug) => {
  const country = toSlug(countrySlug);
  const result = await requestLocation(
    (productKey) => `/location/${productKey}/${country}/states`
  );
  return result.data.map((item) => normalizeLocation(item, "state"));
};

export const getLocationCities = async (countrySlug, stateSlug) => {
  const country = toSlug(countrySlug);
  const state = toSlug(stateSlug);
  const result = await requestLocation(
    (productKey) => `/location/${productKey}/${country}/${state}/cities`
  );
  return result.data.map((item) => normalizeLocation(item, "city"));
};

export const getAreas = async (countrySlug, stateSlug, citySlug) => {
  const country = toSlug(countrySlug);
  const state = toSlug(stateSlug);
  const city = toSlug(citySlug);
  const result = await requestLocation(
    (productKey) => `/location/${productKey}/${country}/${state}/${city}/areas`
  );
  return result.data.map((item) => normalizeLocation(item, "area"));
};

const normalizeBusiness = (item) => {
  const row = item || {};
  const name =
    row.display_name ||
    row.business_name ||
    row.name ||
    row.title ||
    "Business";
  const slug = row.business_slug || row.slug || row.seaneb_id || toSlug(name);
  const areaName = row.area_name || row.area || "";
  const cityName = row.city_name || row.city || "";
  const location = row.address || [areaName, cityName].filter(Boolean).join(", ");

  const rawPrice =
    row.price ||
    row.min_price ||
    row.starting_price ||
    row.price_from ||
    row.price_to ||
    "";

  return {
    id: row.business_id || row.id || slug,
    title: toText(name),
    slug: toText(slug),
    location: toText(location),
    type: toText(row.business_type || row.category || row.type || "property"),
    price: toText(rawPrice),
    image:
      row.business_logo ||
      row.image ||
      row.cover_image ||
      row.logo ||
      row.thumbnail ||
      "/assets/propertyimages/image.png",
    raw: row,
  };
};

export const getBusinessesByArea = async (countrySlug, stateSlug, citySlug, areaSlug) => {
  const country = toSlug(countrySlug);
  const state = toSlug(stateSlug);
  const city = toSlug(citySlug);
  const area = toSlug(areaSlug);

  const result = await requestLocation(
    (productKey) => `/location/${productKey}/${country}/${state}/${city}/${area}/businesses`
  );

  return result.data.map(normalizeBusiness);
};

const normalizeBusinessDetailPayload = (payload) => {
  if (!payload) return null;
  if (payload?.data?.data) return payload.data.data;
  if (payload?.data) return payload.data;
  return payload;
};

export const getBusinessDetailsBySeanebId = async (seanebId) => {
  const id = toText(seanebId);
  if (!id) return null;

  const result = await requestLocationRaw(
    (productKey) => `/location/${productKey}/business/${encodeURIComponent(id)}`
  );

  const first = normalizeBusinessDetailPayload(result?.data);
  return first || null;
};
