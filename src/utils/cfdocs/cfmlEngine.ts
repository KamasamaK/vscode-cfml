import * as semver from "semver";
import { DataType } from "../../entities/dataType";

export enum CFMLEngineName {
  ColdFusion = "coldfusion",
  Lucee = "lucee",
  Railo = "railo",
  OpenBD = "openbd",
  Unknown = "unknown"
}

export namespace CFMLEngineName {
  /**
   * Resolves a string value of name to an enumeration member
   * @param name The name string to resolve
   */
  export function valueOf(name: string): CFMLEngineName {
    switch (name.toLowerCase()) {
      case "coldfusion":
        return CFMLEngineName.ColdFusion;
      case "lucee":
        return CFMLEngineName.Lucee;
      case "railo":
        return CFMLEngineName.Railo;
      case "openbd":
        return CFMLEngineName.OpenBD;
      default:
        return CFMLEngineName.Unknown;
    }
  }
}

export class CFMLEngine {
  private name: CFMLEngineName;
  private version: string;

  constructor(name: CFMLEngineName, version: string|undefined) {
    this.name = name;
    if (semver.valid(version)) {
      this.version = version;
    } else if (DataType.isNumeric(version)) {
      this.version = CFMLEngine.toSemVer(version);
    }
  }

  /**
   * Getter for CFML engine name
   */
  public getName(): CFMLEngineName {
    return this.name;
  }

  /**
   * Getter for CFML engine version
   */
  public getVersion(): string {
    return this.version;
  }

  /**
   * Check if this engine is equal to `other`.
   * @param other A CFML engine.
   */
  public equals(other: CFMLEngine): boolean {
    if (this.name === CFMLEngineName.Unknown || other.name === CFMLEngineName.Unknown) {
      return false;
    }

    if (this.name === other.name) {
      if (!this.version && !other.version) {
        return true;
      } else if (!this.version || !other.version) {
        return false;
      } else {
        return semver.eq(this.version, other.version);
      }
    }

    return false;
  }

  /**
   * Check if this engine is older than `other`. Returns undefined if they have different name.
   * @param other A CFML engine.
   */
  public isOlder(other: CFMLEngine): boolean|undefined {
    if (this.name === CFMLEngineName.Unknown || other.name === CFMLEngineName.Unknown || this.name !== other.name || !this.version || !other.version) {
      return undefined;
    }
    return semver.lt(this.version, other.version);
  }

  /**
   * Check if this engine is older than or equals `other`. Returns undefined if they have different name.
   * @param other A CFML engine.
   */
  public isOlderOrEquals(other: CFMLEngine): boolean|undefined {
    if (this.name === CFMLEngineName.Unknown || other.name === CFMLEngineName.Unknown || this.name !== other.name || !this.version || !other.version) {
      return undefined;
    }
    return semver.lte(this.version, other.version);
  }

  /**
   * Check if this engine is newer than `other`. Returns undefined if they have different name.
   * @param other A CFML engine.
   */
  public isNewer(other: CFMLEngine): boolean|undefined {
    if (this.name === CFMLEngineName.Unknown || other.name === CFMLEngineName.Unknown || this.name !== other.name || !this.version || !other.version) {
      return undefined;
    }
    return semver.gt(this.version, other.version);
  }

  /**
   * Check if this engine is newer than or equals `other`. Returns undefined if they have different name.
   * @param other A CFML engine.
   */
  public isNewerOrEquals(other: CFMLEngine): boolean|undefined {
    if (this.name === CFMLEngineName.Unknown || other.name === CFMLEngineName.Unknown || this.name !== other.name || !this.version || !other.version) {
      return undefined;
    }
    return semver.gte(this.version, other.version);
  }

  /**
   * Returns whether this engine supports tags in script format
   */
  public supportsScriptTags(): boolean {
    return (
      this.name === CFMLEngineName.Unknown
      || (this.name === CFMLEngineName.ColdFusion && semver.gte(this.version, "11.0.0"))
      || this.name === CFMLEngineName.Lucee
      || (this.name === CFMLEngineName.Railo && semver.gte(this.version, "4.2.0"))
    );
  }

  /**
   * Returns whether this engine supports named parameters for global functions
   */
  public supportsGlobalFunctionNamedParams(): boolean {
    // NOTE: Railo and Lucee support this using colons.
    // TODO: Find when = was supported
    return (
      this.name === CFMLEngineName.Unknown
      || (this.name === CFMLEngineName.ColdFusion && semver.gte(this.version, "2018.0.0"))
      || this.name === CFMLEngineName.Lucee
      || (this.name === CFMLEngineName.Railo && semver.gte(this.version, "3.3.0"))
    );
  }

  /**
   * Check if `other` is newer than or equals this engine version. Returns undefined if they have different name.
   * @param version A version string.
   */
  public static toSemVer(version: string): string|undefined {
    if (semver.clean(version)) {
      return semver.clean(version);
    } else if (DataType.isNumeric(version)) {
      const splitVer: string[] = version.split(".");
      while (splitVer.length < 3) {
        splitVer.push("0");
      }
      return splitVer.join(".");
    } else {
      return undefined;
    }
  }
}
