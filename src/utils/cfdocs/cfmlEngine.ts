import { DataType } from "../../entities/dataType";
import { MyMap } from "../collections";

const semver = require("semver");

export enum CFMLEngineVendor {
  ColdFusion = "ColdFusion",
  Lucee = "Lucee",
  Railo = "Railo",
  OpenBD = "OpenBD",
  Unknown = "Unknown"
}

export namespace CFMLEngineVendor {
  /**
   * Resolves a string value of vendor to an enumeration member
   * @param vendor The vendor string to resolve
   */
  export function valueOf(vendor: string): CFMLEngineVendor {
    switch (vendor.toLowerCase()) {
      case "coldfusion":
        return CFMLEngineVendor.ColdFusion;
      case "lucee":
        return CFMLEngineVendor.Lucee;
      case "railo":
        return CFMLEngineVendor.Railo;
      case "openbd":
        return CFMLEngineVendor.OpenBD;
      default:
        return CFMLEngineVendor.Unknown;
    }
  }
}

export class CFMLEngine {
  private static readonly defaultVendor: CFMLEngineVendor = CFMLEngineVendor.ColdFusion;
  private vendor: CFMLEngineVendor;
  private version: string;

  constructor(vendor: CFMLEngineVendor, version: string) {
    if (vendor === CFMLEngineVendor.Unknown) {
      this.vendor = CFMLEngine.defaultVendor;
    } else {
      this.vendor = vendor;
      if (semver.valid(version)) {
        this.version = version;
      } else if (DataType.isNumeric(version)) {
        this.version = CFMLEngine.toSemVer(version);
      }
    }
  }

  /**
   * Check if `other` is equal to this engine.
   * @param other A CFML engine.
   */
  public equals(other: CFMLEngine): boolean {
    if (this.vendor === other.vendor) {
      if (this.version === undefined || other.version === undefined) {
        return true;
      } else if (this.vendor === CFMLEngineVendor.ColdFusion) {
        return parseFloat(this.version) === parseFloat(other.version);
      } else {
        return semver.eq(this.version, other.version);
      }
    }

    return false;
  }

  /**
   * Check if `other` is older than this engine version. Returns undefined if they have different vendor.
   * @param other A CFML engine.
   */
  public isOlder(other: CFMLEngine): boolean|undefined {
    return (this.vendor === other.vendor && parseFloat(this.version) < parseFloat(other.version));
  }

  /**
   * Check if `other` is older than or equals this engine version. Returns undefined if they have different vendor.
   * @param other A CFML engine.
   */
  public isOlderOrEquals(other: CFMLEngine): boolean|undefined {
    return (this.vendor === other.vendor && parseFloat(this.version) <= parseFloat(other.version));
  }

  /**
   * Check if `other` is newer than this engine version. Returns undefined if they have different vendor.
   * @param other A CFML engine.
   */
  public isNewer(other: CFMLEngine): boolean|undefined {
    return (this.vendor === other.vendor && parseFloat(this.version) > parseFloat(other.version));
  }

  /**
   * Check if `other` is newer than or equals this engine version. Returns undefined if they have different vendor.
   * @param other A CFML engine.
   */
  public isNewerOrEquals(other: CFMLEngine): boolean|undefined {
    return (this.vendor === other.vendor && parseFloat(this.version) >= parseFloat(other.version));
  }

  /**
   * Check if `other` is newer than or equals this engine version. Returns undefined if they have different vendor.
   * @param version A version string.
   */
  public static toSemVer(version: string): string|undefined {
    if (semver.clean(version)) {
      return semver.clean(version);
    } else if (DataType.isNumeric(version)) {

    } else {
      return undefined;
    }
  }
}
