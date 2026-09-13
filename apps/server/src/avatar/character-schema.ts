import {
  CHARACTER_BREAST_SIZES,
  CHARACTER_FACES,
  CHARACTER_GENDERS,
  CHARACTER_HAIRSTYLES,
  CHARACTER_HEADWEAR,
  CHARACTER_OUTFITS,
} from "@workhard/shared";
import { z } from "zod";

export const characterAppearanceSchema = z.strictObject({
  gender: z.enum(CHARACTER_GENDERS),
  breastSize: z.enum(CHARACTER_BREAST_SIZES),
  face: z.enum(CHARACTER_FACES),
  hairstyle: z.enum(CHARACTER_HAIRSTYLES),
  upperBody: z.enum(CHARACTER_OUTFITS),
  lowerBody: z.enum(CHARACTER_OUTFITS),
  shoes: z.enum(CHARACTER_OUTFITS),
  headwear: z.enum(CHARACTER_HEADWEAR),
});
