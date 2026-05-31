"""CORDIS source — free bulk CSV download (CC BY 4.0, no auth).

Downloads the per-programme ZIPs (Horizon Europe + H2020) from data.europa.eu,
unzips, and loads project.csv + organization.csv with pandas. Filter projects to
the seed topic via EuroSciVoc / topics, then load once into Postgres.

TODO (Phase 2):
  - download + cache each ZIP from config.CORDIS_DATASETS
  - read project.csv, organization.csv, euroSciVoc.csv with pandas
  - filter projects to climate-adaptation classifications
  - return projects[], participants[] (org name + country + role)
"""
import config


def fetch_projects():
    """Return climate-adaptation EU projects + participants. STUB — Phase 2."""
    raise NotImplementedError("cordis.fetch_projects — implement in Phase 2")
