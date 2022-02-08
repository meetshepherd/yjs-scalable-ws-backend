import config from "../config";
//TODO* instead of importing v2 of node fetch with require hack
//TODO*  see why importing the normal way with v3 does not work
import * as fetch from "node-fetch";

const opengraphRequestURL = (url: string) =>
  `https://graph.facebook.com/v12.0/?fields=og_object&id=${url}&access_token=${config.facebookConfig.access_token}`;

const websiteLogoURL = (url: string) =>
  `https://logo.clearbit.com/${url}`;

interface OGObject {
  // number maybe?, this might be a number which can start with 0
  id: string;
  description: string;
  title: string;
  type: string;
  updated_time: string;
}

interface FacebookOGResponse {
  og_object: OGObject;
  id: string; // url
}

export interface OGResponse {
  title: string,
  description: string,
  type: string,
  image: string,
}

export default async (url: string): Promise<OGResponse | null> => {
  try {
    //? const encodedURL = encodeURIComponent(url);
    const parsedURL = new URL(url); // fails on invalid url
    const data = await fetch.default(opengraphRequestURL(url)) // can fail
      .then((res: any) => res.json())
      .then((raw_data: unknown): OGResponse => {
        const data = raw_data as FacebookOGResponse;
        return {
          title: data.og_object.title ?? '',
          description: data.og_object.description ?? '',
          type: data.og_object.type ?? parsedURL.hostname,
          image: websiteLogoURL(parsedURL.hostname), // cannot fail, but the image can be missing
        };
      });
    return data;
  } catch (e) {
    console.log(e);
    return null;
  }
}