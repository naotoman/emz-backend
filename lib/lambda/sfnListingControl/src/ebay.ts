import axios, { isAxiosError } from "axios";
import * as util from "util";

export const mintAccessToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  isSandbox: boolean
) => {
  const credential = `${clientId}:${clientSecret}`;
  const authorization = "Basic " + Buffer.from(credential).toString("base64");

  const headers = {
    Authorization: authorization,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const payload = `grant_type=refresh_token&refresh_token=${refreshToken}`;

  const url = isSandbox
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

  try {
    const res = await axios.post(url, payload, { headers, timeout: 7500 });
    if (res.status === 200) {
      return {
        access_token: res.data.access_token as string,
        expires_in: res.data.expires_in as number,
      };
    }
    throw new Error(
      `Failed to obtain API token. Response status code: ${
        res.status
      }. Response content: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to obtain API token. ${util.inspect(error.response?.data, {
          depth: null,
        })}`
      );
    }
    throw error;
  }
};

export const createOrReplaceInventoryItem = async (
  accessToken: string,
  sku: string,
  payload: Record<string, unknown>,
  isSandbox: boolean
) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Language": "en-US",
  };
  const url = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/${sku}`
    : `https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`;
  try {
    const res = await axios.put(url, payload, { headers, timeout: 7500 });
    if (![200, 201, 204].includes(res.status)) {
      throw new Error(
        `Failed to create or replace inventory item for sku: ${sku}. Response status code: ${
          res.status
        }. Response content: ${util.inspect(res.data, { depth: null })}`
      );
    }
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to create or replace inventory item for sku: ${sku}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const getInventoryItem = async (
  accessToken: string,
  sku: string,
  isSandbox: boolean
) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const baseUrl = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/${sku}`
    : `https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`;

  try {
    const res = await axios.get(baseUrl, {
      headers,
      timeout: 7500,
    });
    if (res.status === 200) {
      return { exist: true, data: res.data };
    }
    throw new Error(
      `Failed to get inventory item for sku: ${sku}. Response status: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === 404 &&
      error.response.data.errors[0].errorId === 25710
    ) {
      return { exist: false };
    } else if (isAxiosError(error)) {
      throw new Error(
        `Failed to get inventory item for sku: ${sku}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const deleteInventoryItem = async (
  accessToken: string,
  sku: string,
  isSandbox: boolean
) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const url = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/${sku}`
    : `https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`;

  try {
    const res = await axios.delete(url, { headers, timeout: 7500 });
    if (res.status === 204) {
      return true; // Item successfully deleted
    }
    throw new Error(
      `Failed to delete inventory item for sku: ${sku}. Response status code: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === 404 &&
      error.response.data.errors[0].errorId === 25710
    ) {
      return false; // Item not found
    } else if (isAxiosError(error)) {
      throw new Error(
        `Failed to delete inventory item for sku: ${sku}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const createOffer = async (
  accessToken: string,
  payload: object,
  isSandbox: boolean
) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Language": "en-US",
  };

  const url = isSandbox
    ? "https://api.sandbox.ebay.com/sell/inventory/v1/offer"
    : "https://api.ebay.com/sell/inventory/v1/offer";
  try {
    const res = await axios.post(url, payload, { headers, timeout: 7500 });
    if (res.status === 201) {
      return { offerId: res.data.offerId as string };
    }
    throw new Error(
      `Failed to create offer. Response status code: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to create offer. ${util.inspect(error.response?.data, {
          depth: null,
        })}`
      );
    }
    throw error;
  }
};

export const getOffers = async (
  accessToken: string,
  sku: string,
  isSandbox: boolean
) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const baseUrl = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/offer?sku=${sku}`
    : `https://api.ebay.com/sell/inventory/v1/offer?sku=${sku}`;

  try {
    const res = await axios.get(baseUrl, { headers, timeout: 7500 });
    if (res.status === 200 && res.data.total === 1) {
      return { exist: true, data: res.data.offers[0] };
    }
    throw new Error(
      `Failed to get offers for sku: ${sku}. Response status: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === 404 &&
      error.response.data.errors[0].errorId === 25713
    ) {
      return { exist: false };
    } else if (isAxiosError(error)) {
      throw new Error(
        `Failed to get offers for sku: ${sku}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const publishOffer = async (
  accessToken: string,
  offerId: string,
  isSandbox: boolean
) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const url = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/offer/${offerId}/publish`
    : `https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`;

  try {
    const res = await axios.post(url, {}, { headers, timeout: 7500 });
    if (res.status === 200) {
      return { listingId: res.data.listingId as string };
    }
    throw new Error(
      `Failed to publish offer ${offerId}. Response status code: ${
        res.status
      }. Response content: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to publish offer ${offerId}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const updateOffer = async (
  accessToken: string,
  offerId: string,
  payload: object,
  isSandbox: boolean
) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Language": "en-US",
  };

  const url = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/offer/${offerId}`
    : `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`;

  try {
    const res = await axios.put(url, payload, { headers, timeout: 7500 });

    if ([200, 204].includes(res.status)) {
      return;
    }
    throw new Error(
      `Failed to update offer: ${offerId}. Response status code: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to update offer: ${offerId}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};

export const withdrawOffer = async (
  accessToken: string,
  offerId: string,
  isSandbox: boolean
) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const url = isSandbox
    ? `https://api.sandbox.ebay.com/sell/inventory/v1/offer/${offerId}/withdraw`
    : `https://api.ebay.com/sell/inventory/v1/offer/${offerId}/withdraw`;

  try {
    const res = await axios.post(url, {}, { headers, timeout: 7500 });

    if (res.status === 200) {
      return { listingId: res.data.listingId as string };
    }
    throw new Error(
      `Failed to withdraw offer: ${offerId}. Response status code: ${
        res.status
      }. Response body: ${util.inspect(res.data, { depth: null })}`
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to withdraw offer: ${offerId}. ${util.inspect(
          error.response?.data,
          { depth: null }
        )}`
      );
    }
    throw error;
  }
};
