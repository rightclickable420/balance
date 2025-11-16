#!/bin/bash
set -euo pipefail

game="${1:-freedoom2}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
src_dir="${script_dir}/src"
public_dir="${repo_root}/public/gzdoom-runner"

ensure_freedoom_assets() {
  local extracted="${script_dir}/assets/freedoom-0.12.1"
  local archive="${script_dir}/assets/freedoom-0.12.1.zip"

  if [[ -f "${extracted}/freedoom2.wad" ]]; then
    return
  fi

  if [[ ! -f "${archive}" ]]; then
    echo "Missing ${archive}. Please download Freedoom 0.12.1 and place it under scripts/prboom-web/assets." >&2
    exit 1
  fi

  echo "Extracting Freedoom assets..."
  unzip -o "${archive}" -d "${script_dir}/assets" >/dev/null
}

stage_game_assets() {
  local target_dir="${src_dir}/build/${game}"
  mkdir -p "${target_dir}/music" "${target_dir}/sfx"

  case "${game}" in
    freedoom2)
      ensure_freedoom_assets
      cp "${script_dir}/assets/freedoom-0.12.1/freedoom2.wad" "${target_dir}/freedoom.wad"
      ;;
    *)
      echo "Unknown game '${game}'. Add staging logic to scripts/prboom-web/build.sh." >&2
      exit 1
      ;;
  esac

  local custom_dir="${script_dir}/assets/mr-rails"
  local custom_wad="${custom_dir}/mr-rails.wad"
  if [[ -f "${custom_wad}" ]]; then
    cp "${custom_wad}" "${target_dir}/mr-rails.wad"
  else
    echo "[prboom-web] Optional mr-rails.wad not found (looking for ${custom_wad}); skipping custom corridor bundle."
  fi
}

configure_if_needed() {
  pushd "${src_dir}" >/dev/null
  if [[ ! -f config.status ]]; then
    emconfigure ./configure --disable-gl --disable-sdltest CC=emcc
  fi
  popd >/dev/null
}

build_game() {
  pushd "${src_dir}" >/dev/null
  ./build.sh "${game}"
  popd >/dev/null
}

publish_artifacts() {
  local build_output="${src_dir}/build/web/${game}"
  if [[ ! -f "${build_output}/prboom.js" ]]; then
    echo "Build output not found in ${build_output}" >&2
    exit 1
  fi

  rm -rf "${public_dir}"
  mkdir -p "${public_dir}"
  cp "${build_output}/prboom.js" "${public_dir}/prboom.js"
  cp "${build_output}/prboom.wasm" "${public_dir}/prboom.wasm"
  if [[ -f "${build_output}/prboom.data" ]]; then
    cp "${build_output}/prboom.data" "${public_dir}/prboom.data"
  fi
}

stage_game_assets
configure_if_needed
build_game
publish_artifacts

echo "webprboom (${game}) assets published under ${public_dir}"
